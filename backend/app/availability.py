from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Ingredient, MenuItem, Recipe, Reservation, ReservationIngredient


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_active_reserved_qty_by_ingredient(
    session: Session,
    now: datetime | None = None,
) -> dict[int, int]:
    effective_now = now or _utc_now()
    rows = session.execute(
        select(
            ReservationIngredient.ingredient_id,
            func.coalesce(func.sum(ReservationIngredient.qty_reserved), 0),
        )
        .join(Reservation, Reservation.id == ReservationIngredient.reservation_id)
        .where(
            Reservation.status == "active",
            Reservation.expires_at > effective_now,
        )
        .group_by(ReservationIngredient.ingredient_id)
    ).all()

    return {ingredient_id: int(total_qty) for ingredient_id, total_qty in rows}


def ingredient_available_qty(ingredient: Ingredient, active_reserved_qty: int) -> int:
    if ingredient.is_out:
        return 0
    return ingredient.on_hand_qty - active_reserved_qty


def serialize_ingredients(
    ingredients: Sequence[Ingredient],
    active_reserved_qty_by_ingredient: dict[int, int],
) -> list[dict[str, int | str | bool]]:
    payload: list[dict[str, int | str | bool]] = []
    for ingredient in ingredients:
        active_reserved_qty = active_reserved_qty_by_ingredient.get(ingredient.id, 0)
        available_qty = ingredient_available_qty(ingredient, active_reserved_qty)
        payload.append(
            {
                "id": ingredient.id,
                "name": ingredient.name,
                "on_hand_qty": ingredient.on_hand_qty,
                "active_reserved_qty": active_reserved_qty,
                "available_qty": available_qty,
                "low_stock_threshold_qty": ingredient.low_stock_threshold_qty,
                "is_out": ingredient.is_out,
                "low_stock": available_qty <= ingredient.low_stock_threshold_qty,
            }
        )

    return payload


def serialize_menu(
    menu_items: Sequence[MenuItem],
    recipes: Sequence[Recipe],
    ingredients_by_id: dict[int, Ingredient],
    active_reserved_qty_by_ingredient: dict[int, int],
) -> list[dict[str, int | str | bool | None]]:
    recipes_by_menu_item: dict[int, list[Recipe]] = {}
    for recipe in recipes:
        recipes_by_menu_item.setdefault(recipe.menu_item_id, []).append(recipe)

    payload: list[dict[str, int | str | bool | None]] = []

    for menu_item in menu_items:
        failing_reason: str | None = None
        low_stock = False
        available = True

        ordered_recipes = sorted(
            recipes_by_menu_item.get(menu_item.id, []),
            # Stable deterministic ordering for reason selection.
            # First failing ingredient is chosen by ingredient_id ascending.
            key=lambda recipe: (recipe.ingredient_id, recipe.id),
        )

        for recipe in ordered_recipes:
            ingredient = ingredients_by_id[recipe.ingredient_id]
            active_reserved_qty = active_reserved_qty_by_ingredient.get(ingredient.id, 0)
            available_qty = ingredient_available_qty(ingredient, active_reserved_qty)

            if available_qty <= ingredient.low_stock_threshold_qty:
                low_stock = True

            if available_qty < recipe.qty_required and failing_reason is None:
                available = False
                failing_reason = f"Insufficient {ingredient.name}"

        payload.append(
            {
                "id": menu_item.id,
                "name": menu_item.name,
                "price_cents": menu_item.price_cents,
                "category": menu_item.category,
                "allergens": menu_item.allergens,
                "available": available,
                "low_stock": low_stock,
                "reason": failing_reason,
            }
        )

    return payload
