from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Ingredient, MenuItem, Recipe, Reservation, ReservationIngredient, User
from db import SessionLocal


def test_menu_reason_is_deterministic_by_ingredient_id(app_client) -> None:
    with SessionLocal() as session:
        item = MenuItem(name="Double Fail Burger", price_cents=1200)
        tomato = Ingredient(name="Tomato", on_hand_qty=0, low_stock_threshold_qty=2, is_out=False)
        bun = Ingredient(name="Bun", on_hand_qty=0, low_stock_threshold_qty=2, is_out=False)
        session.add_all([item, tomato, bun])
        session.flush()
        session.add_all(
            [
                Recipe(menu_item_id=item.id, ingredient_id=tomato.id, qty_required=1),
                Recipe(menu_item_id=item.id, ingredient_id=bun.id, qty_required=1),
            ]
        )
        session.commit()

    response = app_client.get("/menu")

    assert response.status_code == 200
    body = response.get_json()
    menu_item = next(entry for entry in body if entry["name"] == "Double Fail Burger")
    assert menu_item["available"] is False
    assert menu_item["reason"] == "Insufficient Tomato"


def test_active_reserved_qty_excludes_non_active_or_expired_reservations(app_client) -> None:
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        user_id = session.execute(select(User.id).where(User.email == "kitchen@example.com")).scalar_one()
        item = MenuItem(name="Reserved Burger", price_cents=1300)
        patty = Ingredient(name="Patty", on_hand_qty=10, low_stock_threshold_qty=2, is_out=False)
        session.add_all([item, patty])
        session.flush()
        session.add(Recipe(menu_item_id=item.id, ingredient_id=patty.id, qty_required=8))

        reservations = [
            Reservation(user_id=user_id, status="active", expires_at=now + timedelta(minutes=5)),
            Reservation(user_id=user_id, status="active", expires_at=now - timedelta(minutes=1)),
            Reservation(user_id=user_id, status="committed", expires_at=now + timedelta(minutes=5)),
            Reservation(user_id=user_id, status="released", expires_at=now + timedelta(minutes=5)),
            Reservation(user_id=user_id, status="expired", expires_at=now + timedelta(minutes=5)),
        ]
        session.add_all(reservations)
        session.flush()

        session.add_all(
            [
                ReservationIngredient(
                    reservation_id=reservations[0].id,
                    ingredient_id=patty.id,
                    qty_reserved=3,
                ),
                ReservationIngredient(
                    reservation_id=reservations[1].id,
                    ingredient_id=patty.id,
                    qty_reserved=4,
                ),
                ReservationIngredient(
                    reservation_id=reservations[2].id,
                    ingredient_id=patty.id,
                    qty_reserved=5,
                ),
                ReservationIngredient(
                    reservation_id=reservations[3].id,
                    ingredient_id=patty.id,
                    qty_reserved=2,
                ),
                ReservationIngredient(
                    reservation_id=reservations[4].id,
                    ingredient_id=patty.id,
                    qty_reserved=1,
                ),
            ]
        )
        session.commit()

    ingredients_response = app_client.get("/ingredients")
    assert ingredients_response.status_code == 200
    ingredients_body = ingredients_response.get_json()
    patty_row = next(entry for entry in ingredients_body if entry["name"] == "Patty")
    assert patty_row["active_reserved_qty"] == 3
    assert patty_row["available_qty"] == 7

    menu_response = app_client.get("/menu")
    assert menu_response.status_code == 200
    menu_body = menu_response.get_json()
    menu_item = next(entry for entry in menu_body if entry["name"] == "Reserved Burger")
    assert menu_item["available"] is False
    assert menu_item["reason"] == "Insufficient Patty"
