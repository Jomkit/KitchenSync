from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.reservation_expiration import expire_reservations_once
from app.models import Ingredient, MenuItem, Recipe
from db import SessionLocal


def _login_online(client) -> str:
    response = client.post(
        "/auth/login",
        json={"username": "online@example.com", "password": "pass"},
    )
    assert response.status_code == 200
    return response.get_json()["access_token"]


def test_menu_reason_is_deterministic_by_ingredient_id(app_client) -> None:
    with SessionLocal() as session:
        item = MenuItem(name="Double Fail Burger", price_cents=1200)
        bun = Ingredient(name="Bun", on_hand_qty=0, low_stock_threshold_qty=2, is_out=False)
        tomato = Ingredient(name="Tomato", on_hand_qty=0, low_stock_threshold_qty=2, is_out=False)
        session.add_all([item, bun, tomato])
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
    assert menu_item["reason"] == "Insufficient Bun"


def test_get_ingredients_includes_computed_fields(app_client) -> None:
    with SessionLocal() as session:
        patty = Ingredient(name="Computed Patty", on_hand_qty=10, low_stock_threshold_qty=5, is_out=False)
        item = MenuItem(name="Computed Burger", price_cents=1000)
        session.add_all([patty, item])
        session.flush()
        session.add(Recipe(menu_item_id=item.id, ingredient_id=patty.id, qty_required=4))
        session.commit()
        menu_item_id = item.id

    token = _login_online(app_client)
    reservation_response = app_client.post(
        "/reservations",
        json={"items": [{"menu_item_id": menu_item_id, "qty": 1}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert reservation_response.status_code == 201

    ingredients_response = app_client.get("/ingredients")
    assert ingredients_response.status_code == 200
    ingredients = ingredients_response.get_json()
    patty_row = next(entry for entry in ingredients if entry["name"] == "Computed Patty")
    assert patty_row["active_reserved_qty"] == 4
    assert patty_row["available_qty"] == 6
    assert patty_row["low_stock"] is False


def test_get_ingredients_excludes_expired_from_reserved_qty(app_client) -> None:
    with SessionLocal() as session:
        patty = Ingredient(name="Expired Patty", on_hand_qty=8, low_stock_threshold_qty=5, is_out=False)
        item = MenuItem(name="Expired Burger", price_cents=1000)
        session.add_all([patty, item])
        session.flush()
        session.add(Recipe(menu_item_id=item.id, ingredient_id=patty.id, qty_required=3))
        session.commit()
        menu_item_id = item.id

    token = _login_online(app_client)
    reservation_response = app_client.post(
        "/reservations",
        json={"items": [{"menu_item_id": menu_item_id, "qty": 1}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert reservation_response.status_code == 201

    expired_count = expire_reservations_once(now=datetime.now(timezone.utc) + timedelta(minutes=11))
    assert expired_count == 1

    ingredients_response = app_client.get("/ingredients")
    assert ingredients_response.status_code == 200
    ingredients = ingredients_response.get_json()
    patty_row = next(entry for entry in ingredients if entry["name"] == "Expired Patty")
    assert patty_row["active_reserved_qty"] == 0
    assert patty_row["available_qty"] == 8
