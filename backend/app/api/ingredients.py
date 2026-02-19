from flask import Blueprint, jsonify, request
from sqlalchemy import select

from app import socketio
from app.auth import require_role
from app.availability import get_active_reserved_qty_by_ingredient, serialize_ingredients
from app.models import Ingredient
from db import SessionLocal

ingredients_bp = Blueprint("ingredients", __name__)


@ingredients_bp.get("/ingredients")
def get_ingredients() -> tuple[list[dict[str, int | str | bool]], int]:
    with SessionLocal() as session:
        ingredients = session.execute(select(Ingredient).order_by(Ingredient.id.asc())).scalars().all()
        active_reserved_qty_by_ingredient = get_active_reserved_qty_by_ingredient(session)

    return jsonify(serialize_ingredients(ingredients, active_reserved_qty_by_ingredient)), 200


@ingredients_bp.patch("/ingredients/<int:ingredient_id>")
@require_role("kitchen")
def update_ingredient(ingredient_id: int) -> tuple[dict[str, int | str | bool], int]:
    payload = request.get_json(silent=True) or {}
    updates: dict[str, int | bool] = {}

    if "on_hand_qty" in payload:
        on_hand_qty = payload.get("on_hand_qty")
        if not isinstance(on_hand_qty, int) or isinstance(on_hand_qty, bool):
            return jsonify({"error": "on_hand_qty must be an integer"}), 400
        if on_hand_qty < 0:
            return jsonify({"error": "on_hand_qty must be non-negative"}), 400
        updates["on_hand_qty"] = on_hand_qty

    if "is_out" in payload:
        is_out = payload.get("is_out")
        if not isinstance(is_out, bool):
            return jsonify({"error": "is_out must be a boolean"}), 400
        updates["is_out"] = is_out

    if not updates:
        return jsonify({"error": "Provide on_hand_qty and/or is_out"}), 400

    with SessionLocal() as session:
        ingredient = session.get(Ingredient, ingredient_id)
        if ingredient is None:
            return jsonify({"error": "Ingredient not found"}), 404

        if "on_hand_qty" in updates:
            ingredient.on_hand_qty = updates["on_hand_qty"]
        if "is_out" in updates:
            ingredient.is_out = updates["is_out"]
        session.commit()

        response_body = {
            "id": ingredient.id,
            "name": ingredient.name,
            "on_hand_qty": ingredient.on_hand_qty,
            "low_stock_threshold_qty": ingredient.low_stock_threshold_qty,
            "is_out": ingredient.is_out,
        }

    socketio.emit("stateChanged")
    return jsonify(response_body), 200
