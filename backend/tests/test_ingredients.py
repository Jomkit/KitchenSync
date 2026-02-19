from __future__ import annotations

from sqlalchemy import select

from app.models import Ingredient
from db import SessionLocal


def _login(client, username: str, password: str) -> str:
    response = client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.get_json()["access_token"]


def test_patch_ingredient_enforces_non_negative_on_hand_qty(app_client) -> None:
    with SessionLocal() as session:
        ingredient = Ingredient(name="Cheese", on_hand_qty=5, low_stock_threshold_qty=2, is_out=False)
        session.add(ingredient)
        session.commit()
        ingredient_id = ingredient.id

    token = _login(app_client, "kitchen@example.com", "pass")
    response = app_client.patch(
        f"/ingredients/{ingredient_id}",
        json={"on_hand_qty": -1},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "on_hand_qty must be non-negative"

    with SessionLocal() as session:
        persisted = session.execute(select(Ingredient).where(Ingredient.id == ingredient_id)).scalar_one()
        assert persisted.on_hand_qty == 5


def test_patch_ingredient_requires_kitchen_role(app_client) -> None:
    with SessionLocal() as session:
        ingredient = Ingredient(name="Lettuce", on_hand_qty=3, low_stock_threshold_qty=1, is_out=False)
        session.add(ingredient)
        session.commit()
        ingredient_id = ingredient.id

    token = _login(app_client, "foh@example.com", "pass")
    response = app_client.patch(
        f"/ingredients/{ingredient_id}",
        json={"on_hand_qty": 8, "is_out": True},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.get_json()["error"] == "Role 'kitchen' is required"

    with SessionLocal() as session:
        persisted = session.execute(select(Ingredient).where(Ingredient.id == ingredient_id)).scalar_one()
        assert persisted.on_hand_qty == 3
        assert persisted.is_out is False
