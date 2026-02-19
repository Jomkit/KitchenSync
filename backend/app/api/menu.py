from flask import Blueprint, jsonify
from sqlalchemy import select

from app.availability import get_active_reserved_qty_by_ingredient, serialize_menu
from app.models import Ingredient, MenuItem, Recipe
from db import SessionLocal

menu_bp = Blueprint("menu", __name__)


@menu_bp.get("/menu")
def get_menu() -> tuple[list[dict[str, int | str | bool | None]], int]:
    with SessionLocal() as session:
        menu_items = session.execute(select(MenuItem).order_by(MenuItem.id.asc())).scalars().all()
        recipes = session.execute(select(Recipe)).scalars().all()
        ingredients = session.execute(select(Ingredient)).scalars().all()
        active_reserved_qty_by_ingredient = get_active_reserved_qty_by_ingredient(session)

    ingredients_by_id = {ingredient.id: ingredient for ingredient in ingredients}
    menu_payload = serialize_menu(
        menu_items=menu_items,
        recipes=recipes,
        ingredients_by_id=ingredients_by_id,
        active_reserved_qty_by_ingredient=active_reserved_qty_by_ingredient,
    )
    return jsonify(menu_payload), 200
