from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
from sqlalchemy import select

from app.availability import (
    get_active_reserved_qty_by_ingredient,
    serialize_ingredients,
    serialize_menu,
)
from app.models import Ingredient, MenuItem, Recipe
from db import SessionLocal

socketio = SocketIO(cors_allowed_origins=["http://localhost:5173"])


def create_app() -> Flask:
    app = Flask(__name__)

    CORS(app, resources={r"/*": {"origins": ["http://localhost:5173"]}})

    @app.get("/health")
    def health() -> tuple[dict[str, str], int]:
        return jsonify({"status": "ok"}), 200

    @app.get("/ingredients")
    def get_ingredients() -> tuple[list[dict[str, int | str | bool]], int]:
        with SessionLocal() as session:
            ingredients = session.execute(select(Ingredient).order_by(Ingredient.id.asc())).scalars().all()
            active_reserved_qty_by_ingredient = get_active_reserved_qty_by_ingredient(session)

        return jsonify(serialize_ingredients(ingredients, active_reserved_qty_by_ingredient)), 200

    @app.get("/menu")
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

    from app import events  # noqa: F401
    from app.auth import auth_bp

    app.register_blueprint(auth_bp)
    socketio.init_app(app, async_mode="eventlet")
    return app
