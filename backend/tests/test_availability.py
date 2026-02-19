from __future__ import annotations

from app.models import Ingredient, MenuItem, Recipe
from db import SessionLocal


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
