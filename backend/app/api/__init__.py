from flask import Flask

from app.api.internal import internal_bp
from app.api.ingredients import ingredients_bp
from app.api.menu import menu_bp
from app.api.reservations import reservations_bp


def register_blueprints(app: Flask) -> None:
    app.register_blueprint(internal_bp)
    app.register_blueprint(ingredients_bp)
    app.register_blueprint(menu_bp)
    app.register_blueprint(reservations_bp)
