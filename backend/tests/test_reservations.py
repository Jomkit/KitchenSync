from __future__ import annotations

from datetime import datetime, timedelta, timezone
from queue import Queue
from threading import Barrier, Thread

from sqlalchemy import select

from app import create_app
from app.models import Ingredient, MenuItem, Recipe, Reservation, ReservationIngredient, ReservationItem
from app.reservation_expiration import expire_reservations_once_and_emit
from db import SessionLocal


def _login_online(client) -> str:
    response = client.post(
        "/auth/login",
        json={"username": "online@example.com", "password": "pass"},
    )
    assert response.status_code == 200
    return response.get_json()["access_token"]


def _build_inventory_for_success_case() -> tuple[int, int]:
    with SessionLocal() as session:
        bun = Ingredient(name="Test Bun", on_hand_qty=20, low_stock_threshold_qty=3, is_out=False)
        patty = Ingredient(name="Test Patty", on_hand_qty=20, low_stock_threshold_qty=3, is_out=False)
        cheese = Ingredient(name="Test Cheese", on_hand_qty=20, low_stock_threshold_qty=3, is_out=False)

        basic = MenuItem(name="Test Basic Burger", price_cents=1000)
        deluxe = MenuItem(name="Test Deluxe Burger", price_cents=1200)

        session.add_all([bun, patty, cheese, basic, deluxe])
        session.flush()
        session.add_all(
            [
                Recipe(menu_item_id=basic.id, ingredient_id=bun.id, qty_required=1),
                Recipe(menu_item_id=basic.id, ingredient_id=patty.id, qty_required=1),
                Recipe(menu_item_id=deluxe.id, ingredient_id=bun.id, qty_required=2),
                Recipe(menu_item_id=deluxe.id, ingredient_id=cheese.id, qty_required=1),
            ]
        )
        session.commit()
        return basic.id, deluxe.id


def test_reservation_success_creates_rows(app_client) -> None:
    basic_id, deluxe_id = _build_inventory_for_success_case()
    token = _login_online(app_client)

    response = app_client.post(
        "/reservations",
        json={
            "items": [
                {"menu_item_id": basic_id, "qty": 2},
                {"menu_item_id": deluxe_id, "qty": 1, "notes": "No onions"},
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    reservation_id = response.get_json()["id"]

    with SessionLocal() as session:
        reservation = session.get(Reservation, reservation_id)
        assert reservation is not None
        assert reservation.status == "active"
        assert reservation.expires_at > datetime.now(timezone.utc)

        reservation_items = session.execute(
            select(ReservationItem).where(ReservationItem.reservation_id == reservation_id)
        ).scalars().all()
        assert len(reservation_items) == 2
        item_qty_by_menu_id = {item.menu_item_id: item.qty for item in reservation_items}
        assert item_qty_by_menu_id == {basic_id: 2, deluxe_id: 1}

        reserved_rows = session.execute(
            select(ReservationIngredient).where(ReservationIngredient.reservation_id == reservation_id)
        ).scalars().all()
        reserved_by_name = {
            session.get(Ingredient, row.ingredient_id).name: row.qty_reserved for row in reserved_rows
        }
        assert reserved_by_name == {"Test Bun": 4, "Test Patty": 2, "Test Cheese": 1}


def test_reservation_failure_returns_409_structured_errors(app_client) -> None:
    with SessionLocal() as session:
        lettuce = Ingredient(
            name="Test Out Lettuce",
            on_hand_qty=10,
            low_stock_threshold_qty=2,
            is_out=True,
        )
        item = MenuItem(name="Test Lettuce Wrap", price_cents=900)
        session.add_all([lettuce, item])
        session.flush()
        session.add(Recipe(menu_item_id=item.id, ingredient_id=lettuce.id, qty_required=1))
        session.commit()
        menu_item_id = item.id
        ingredient_id = lettuce.id

    token = _login_online(app_client)
    response = app_client.post(
        "/reservations",
        json={"items": [{"menu_item_id": menu_item_id, "qty": 1}]},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    body = response.get_json()
    assert body["code"] == "INSUFFICIENT_INGREDIENTS"
    assert isinstance(body["errors"], list)
    assert len(body["errors"]) == 1

    error = body["errors"][0]
    assert error["ingredient_id"] == ingredient_id
    assert error["ingredient_name"] == "Test Out Lettuce"
    assert error["required_qty"] == 1
    assert error["available_qty"] == 0
    assert error["is_out"] is True
    assert "Test Out Lettuce" in error["message"]


def test_concurrent_reservations_only_one_succeeds(app_client) -> None:
    with SessionLocal() as session:
        patty = Ingredient(
            name="Test Last Patty",
            on_hand_qty=1,
            low_stock_threshold_qty=0,
            is_out=False,
        )
        item = MenuItem(name="Test Single Patty Burger", price_cents=1000)
        session.add_all([patty, item])
        session.flush()
        session.add(Recipe(menu_item_id=item.id, ingredient_id=patty.id, qty_required=1))
        session.commit()
        menu_item_id = item.id

    token = _login_online(app_client)
    barrier = Barrier(3)
    results: Queue[tuple[int, dict[str, object]]] = Queue()
    errors: Queue[BaseException] = Queue()

    def worker() -> None:
        local_app = create_app()
        local_app.config["TESTING"] = True
        try:
            with local_app.test_client() as local_client:
                barrier.wait(timeout=15)
                response = local_client.post(
                    "/reservations",
                    json={"items": [{"menu_item_id": menu_item_id, "qty": 1}]},
                    headers={"Authorization": f"Bearer {token}"},
                )
                results.put((response.status_code, response.get_json()))
        except BaseException as exc:
            errors.put(exc)

    t1 = Thread(target=worker)
    t2 = Thread(target=worker)
    t1.start()
    t2.start()

    barrier.wait(timeout=15)
    t1.join(timeout=15)
    t2.join(timeout=15)

    assert errors.empty(), list(errors.queue)
    assert results.qsize() == 2

    outcomes = [results.get_nowait(), results.get_nowait()]
    status_codes = sorted([status for status, _ in outcomes])
    assert status_codes == [201, 409]

    conflict_body = next(body for status, body in outcomes if status == 409)
    assert conflict_body["code"] == "INSUFFICIENT_INGREDIENTS"


def test_commit_is_idempotent_and_decrements_once(app_client) -> None:
    with SessionLocal() as session:
        patty = Ingredient(
            name="Test Commit Patty",
            on_hand_qty=10,
            low_stock_threshold_qty=1,
            is_out=False,
        )
        item = MenuItem(name="Test Commit Burger", price_cents=1200)
        session.add_all([patty, item])
        session.flush()
        session.add(Recipe(menu_item_id=item.id, ingredient_id=patty.id, qty_required=2))
        session.commit()
        ingredient_id = patty.id
        menu_item_id = item.id

    token = _login_online(app_client)
    create_response = app_client.post(
        "/reservations",
        json={"items": [{"menu_item_id": menu_item_id, "qty": 1}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_response.status_code == 201
    reservation_id = create_response.get_json()["id"]

    with SessionLocal() as session:
        before_commit = session.get(Ingredient, ingredient_id).on_hand_qty

    first_commit = app_client.post(
        f"/reservations/{reservation_id}/commit",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert first_commit.status_code == 200

    with SessionLocal() as session:
        after_first_commit = session.get(Ingredient, ingredient_id).on_hand_qty

    second_commit = app_client.post(
        f"/reservations/{reservation_id}/commit",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert second_commit.status_code == 200

    with SessionLocal() as session:
        after_second_commit = session.get(Ingredient, ingredient_id).on_hand_qty

    assert before_commit - after_first_commit == 2
    assert after_second_commit == after_first_commit


def test_expiration_iteration_expires_and_restores_availability(app_client) -> None:
    with SessionLocal() as session:
        patty = Ingredient(
            name="Test Expire Patty",
            on_hand_qty=1,
            low_stock_threshold_qty=0,
            is_out=False,
        )
        item = MenuItem(name="Test Expire Burger", price_cents=1100)
        session.add_all([patty, item])
        session.flush()
        session.add(Recipe(menu_item_id=item.id, ingredient_id=patty.id, qty_required=1))
        session.commit()
        menu_item_id = item.id

    token = _login_online(app_client)
    create_response = app_client.post(
        "/reservations",
        json={"items": [{"menu_item_id": menu_item_id, "qty": 1}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_response.status_code == 201
    reservation_id = create_response.get_json()["id"]

    before_expiration = app_client.get("/ingredients")
    assert before_expiration.status_code == 200
    before_patty = next(row for row in before_expiration.get_json() if row["name"] == "Test Expire Patty")
    assert before_patty["active_reserved_qty"] == 1
    assert before_patty["available_qty"] == 0

    with SessionLocal() as session:
        reservation = session.get(Reservation, reservation_id)
        assert reservation is not None
        reservation.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        session.commit()

    expired_count = expire_reservations_once_and_emit()
    assert expired_count == 1

    with SessionLocal() as session:
        reservation = session.get(Reservation, reservation_id)
        assert reservation is not None
        assert reservation.status == "expired"

    after_expiration = app_client.get("/ingredients")
    assert after_expiration.status_code == 200
    after_patty = next(row for row in after_expiration.get_json() if row["name"] == "Test Expire Patty")
    assert after_patty["active_reserved_qty"] == 0
    assert after_patty["available_qty"] == 1
