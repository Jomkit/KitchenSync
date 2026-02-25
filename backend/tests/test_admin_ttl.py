from __future__ import annotations

from datetime import datetime, timezone

from app.models import Ingredient, MenuItem, Recipe
from app.runtime_reservation_ttl import set_runtime_ttl_seconds
from config import settings
from db import SessionLocal


def _login(client, username: str) -> str:
    response = client.post("/auth/login", json={"username": username, "password": "pass"})
    assert response.status_code == 200
    return response.get_json()["access_token"]


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_simple_menu_item() -> int:
    with SessionLocal() as session:
        ingredient = Ingredient(name="TTL Test Ingredient", on_hand_qty=20, low_stock_threshold_qty=2, is_out=False)
        menu_item = MenuItem(name="TTL Test Item", price_cents=1000)
        session.add_all([ingredient, menu_item])
        session.flush()
        session.add(Recipe(menu_item_id=menu_item.id, ingredient_id=ingredient.id, qty_required=1))
        session.commit()
        return menu_item.id


def test_foh_can_update_ttl_and_new_reservation_uses_it(app_client) -> None:
    set_runtime_ttl_seconds(settings.reservation_ttl_seconds)
    menu_item_id = _create_simple_menu_item()

    foh_token = _login(app_client, "foh@example.com")
    update_response = app_client.patch(
        "/admin/reservation-ttl",
        json={"ttl_minutes": 1},
        headers=_auth_header(foh_token),
    )
    assert update_response.status_code == 200
    assert update_response.get_json()["ttl_minutes"] == 1

    online_token = _login(app_client, "online@example.com")
    reservation_response = app_client.post(
        "/reservations",
        json={"items": [{"menu_item_id": menu_item_id, "qty": 1}]},
        headers=_auth_header(online_token),
    )
    assert reservation_response.status_code == 201
    expires_at = datetime.fromisoformat(reservation_response.get_json()["expires_at"])

    now = datetime.now(timezone.utc)
    seconds_until_expiry = int((expires_at - now).total_seconds())
    assert 30 <= seconds_until_expiry <= 90


def test_non_foh_cannot_update_ttl(app_client) -> None:
    set_runtime_ttl_seconds(settings.reservation_ttl_seconds)
    online_token = _login(app_client, "online@example.com")
    response = app_client.patch(
        "/admin/reservation-ttl",
        json={"ttl_minutes": 5},
        headers=_auth_header(online_token),
    )
    assert response.status_code == 403


def test_get_reservation_returns_status_and_expires_at(app_client) -> None:
    set_runtime_ttl_seconds(settings.reservation_ttl_seconds)
    menu_item_id = _create_simple_menu_item()
    online_token = _login(app_client, "online@example.com")

    create_response = app_client.post(
        "/reservations",
        json={"items": [{"menu_item_id": menu_item_id, "qty": 1}]},
        headers=_auth_header(online_token),
    )
    assert create_response.status_code == 201
    reservation_id = create_response.get_json()["id"]

    get_response = app_client.get(
        f"/reservations/{reservation_id}",
        headers=_auth_header(online_token),
    )
    assert get_response.status_code == 200
    body = get_response.get_json()
    assert body["id"] == reservation_id
    assert body["status"] == "active"
    assert isinstance(body["expires_at"], str)
