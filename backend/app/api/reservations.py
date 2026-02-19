from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import logging
from typing import Any

from flask import Blueprint, g, jsonify, request
from sqlalchemy import delete, func, select

from app import socketio
from app.auth import require_any_role
from app.models import Ingredient, MenuItem, Recipe, Reservation, ReservationIngredient, ReservationItem
from db import SessionLocal

reservations_bp = Blueprint("reservations", __name__)
logger = logging.getLogger("kitchensync.api.reservations")

RESERVATION_TTL_MINUTES = 10


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _build_insufficient_error(
    *,
    ingredient: Ingredient,
    required_qty: int,
    available_qty: int,
) -> dict[str, Any]:
    return {
        "ingredient_id": ingredient.id,
        "ingredient_name": ingredient.name,
        "required_qty": required_qty,
        "available_qty": available_qty,
        "is_out": ingredient.is_out,
        "message": f"Insufficient {ingredient.name}",
    }


def _read_online_user_id() -> int | None:
    claims = getattr(g, "jwt_claims", {})
    raw_user_id = claims.get("sub")
    try:
        return int(raw_user_id)
    except (TypeError, ValueError):
        return None


def _normalize_reservation_items(payload_items: object) -> tuple[list[dict[str, Any]] | None, tuple[dict[str, str], int] | None]:
    if not isinstance(payload_items, list) or not payload_items:
        return None, ({"error": "items must be a non-empty list"}, 400)

    normalized: dict[int, dict[str, Any]] = {}
    for item in payload_items:
        if not isinstance(item, dict):
            return None, ({"error": "each item must be an object"}, 400)

        menu_item_id = item.get("menu_item_id")
        qty = item.get("qty")
        notes = item.get("notes")

        if not isinstance(menu_item_id, int) or isinstance(menu_item_id, bool):
            return None, ({"error": "menu_item_id must be an integer"}, 400)
        if not isinstance(qty, int) or isinstance(qty, bool) or qty < 1:
            return None, ({"error": "qty must be an integer >= 1"}, 400)
        if notes is not None and not isinstance(notes, str):
            return None, ({"error": "notes must be a string when provided"}, 400)

        existing = normalized.get(menu_item_id)
        if existing is None:
            normalized[menu_item_id] = {"menu_item_id": menu_item_id, "qty": qty, "notes": notes}
            continue

        existing["qty"] += qty
        if notes is not None:
            existing["notes"] = notes

    ordered_items = [normalized[menu_item_id] for menu_item_id in sorted(normalized.keys())]
    return ordered_items, None


@reservations_bp.post("/reservations")
@require_any_role("online", "foh")
def create_reservation() -> tuple[dict[str, Any], int]:
    payload = request.get_json(silent=True) or {}
    normalized_items, validation_error = _normalize_reservation_items(payload.get("items"))
    if validation_error is not None:
        body, status_code = validation_error
        return jsonify(body), status_code

    user_id = _read_online_user_id()
    if user_id is None:
        logger.warning("create_reservation failed invalid_token_subject")
        return jsonify({"error": "Invalid access token subject"}), 401
    logger.info("create_reservation start user_id=%s item_count=%s", user_id, len(normalized_items))

    now = _utc_now()
    expires_at = now + timedelta(minutes=RESERVATION_TTL_MINUTES)
    menu_item_ids = [item["menu_item_id"] for item in normalized_items]
    requested_qty_by_menu_item = {
        item["menu_item_id"]: item["qty"] for item in normalized_items
    }

    with SessionLocal() as session:
        with session.begin():
            menu_items = session.execute(
                select(MenuItem).where(MenuItem.id.in_(menu_item_ids))
            ).scalars().all()
            found_menu_item_ids = {menu_item.id for menu_item in menu_items}
            missing_menu_item_ids = sorted(set(menu_item_ids) - found_menu_item_ids)
            if missing_menu_item_ids:
                logger.warning(
                    "create_reservation failed unknown_menu_items=%s",
                    missing_menu_item_ids,
                )
                return (
                    jsonify({"error": f"Unknown menu_item_id values: {missing_menu_item_ids}"}),
                    400,
                )

            recipes = session.execute(
                select(Recipe).where(Recipe.menu_item_id.in_(menu_item_ids))
            ).scalars().all()

            required_qty_by_ingredient: dict[int, int] = defaultdict(int)
            for recipe in recipes:
                required_qty_by_ingredient[recipe.ingredient_id] += (
                    recipe.qty_required * requested_qty_by_menu_item[recipe.menu_item_id]
                )

            ingredient_ids = sorted(required_qty_by_ingredient.keys())
            ingredients = session.execute(
                select(Ingredient)
                .where(Ingredient.id.in_(ingredient_ids))
                .order_by(Ingredient.id.asc())
                .with_for_update()
            ).scalars().all()
            ingredients_by_id = {ingredient.id: ingredient for ingredient in ingredients}

            active_reserved_rows = session.execute(
                select(
                    ReservationIngredient.ingredient_id,
                    func.coalesce(func.sum(ReservationIngredient.qty_reserved), 0),
                )
                .join(Reservation, Reservation.id == ReservationIngredient.reservation_id)
                .where(
                    ReservationIngredient.ingredient_id.in_(ingredient_ids),
                    Reservation.status == "active",
                    Reservation.expires_at > now,
                )
                .group_by(ReservationIngredient.ingredient_id)
            ).all()
            active_reserved_qty_by_ingredient = {
                ingredient_id: int(total_qty)
                for ingredient_id, total_qty in active_reserved_rows
            }

            insufficient_errors: list[dict[str, Any]] = []
            for ingredient_id in ingredient_ids:
                ingredient = ingredients_by_id[ingredient_id]
                required_qty = required_qty_by_ingredient[ingredient_id]
                active_reserved_qty = active_reserved_qty_by_ingredient.get(ingredient_id, 0)
                available_qty = 0 if ingredient.is_out else ingredient.on_hand_qty - active_reserved_qty

                if available_qty < required_qty:
                    insufficient_errors.append(
                        _build_insufficient_error(
                            ingredient=ingredient,
                            required_qty=required_qty,
                            available_qty=available_qty,
                        )
                    )

            if insufficient_errors:
                logger.warning(
                    "create_reservation conflict user_id=%s insufficient_count=%s",
                    user_id,
                    len(insufficient_errors),
                )
                return (
                    jsonify({"code": "INSUFFICIENT_INGREDIENTS", "errors": insufficient_errors}),
                    409,
                )

            reservation = Reservation(
                user_id=user_id,
                status="active",
                expires_at=expires_at,
            )
            session.add(reservation)
            session.flush()

            for item in normalized_items:
                session.add(
                    ReservationItem(
                        reservation_id=reservation.id,
                        menu_item_id=item["menu_item_id"],
                        qty=item["qty"],
                        notes=item["notes"],
                    )
                )

            for ingredient_id in ingredient_ids:
                session.add(
                    ReservationIngredient(
                        reservation_id=reservation.id,
                        ingredient_id=ingredient_id,
                        qty_reserved=required_qty_by_ingredient[ingredient_id],
                    )
                )

            reservation_id = reservation.id

    socketio.emit("stateChanged")
    logger.info(
        "create_reservation success reservation_id=%s user_id=%s expires_at=%s",
        reservation_id,
        user_id,
        expires_at.isoformat(),
    )
    return (
        jsonify(
            {
                "id": reservation_id,
                "status": "active",
                "expires_at": expires_at.isoformat(),
            }
        ),
        201,
    )


@reservations_bp.patch("/reservations/<int:reservation_id>")
@require_any_role("online", "foh")
def update_reservation(reservation_id: int) -> tuple[dict[str, Any], int]:
    payload = request.get_json(silent=True) or {}
    normalized_items, validation_error = _normalize_reservation_items(payload.get("items"))
    if validation_error is not None:
        body, status_code = validation_error
        return jsonify(body), status_code

    now = _utc_now()
    expires_at = now + timedelta(minutes=RESERVATION_TTL_MINUTES)
    menu_item_ids = [item["menu_item_id"] for item in normalized_items]
    requested_qty_by_menu_item = {
        item["menu_item_id"]: item["qty"] for item in normalized_items
    }

    state_changed = False
    logger.info("update_reservation start reservation_id=%s item_count=%s", reservation_id, len(normalized_items))

    with SessionLocal() as session:
        with session.begin():
            reservation = session.execute(
                select(Reservation)
                .where(Reservation.id == reservation_id)
                .with_for_update()
            ).scalar_one_or_none()
            if reservation is None:
                logger.warning("update_reservation failed reservation_not_found reservation_id=%s", reservation_id)
                return jsonify({"error": "Reservation not found"}), 404

            if reservation.status != "active":
                logger.warning(
                    "update_reservation failed reservation_id=%s status=%s",
                    reservation_id,
                    reservation.status,
                )
                return jsonify({"error": f"Reservation is {reservation.status}"}), 409

            if reservation.expires_at <= now:
                reservation.status = "expired"
                state_changed = True
                logger.warning("update_reservation failed reservation_expired reservation_id=%s", reservation_id)
                return jsonify({"error": "Reservation expired"}), 409

            menu_items = session.execute(
                select(MenuItem).where(MenuItem.id.in_(menu_item_ids))
            ).scalars().all()
            found_menu_item_ids = {menu_item.id for menu_item in menu_items}
            missing_menu_item_ids = sorted(set(menu_item_ids) - found_menu_item_ids)
            if missing_menu_item_ids:
                logger.warning(
                    "update_reservation failed reservation_id=%s unknown_menu_items=%s",
                    reservation_id,
                    missing_menu_item_ids,
                )
                return (
                    jsonify({"error": f"Unknown menu_item_id values: {missing_menu_item_ids}"}),
                    400,
                )

            recipes = session.execute(
                select(Recipe).where(Recipe.menu_item_id.in_(menu_item_ids))
            ).scalars().all()

            required_qty_by_ingredient: dict[int, int] = defaultdict(int)
            for recipe in recipes:
                required_qty_by_ingredient[recipe.ingredient_id] += (
                    recipe.qty_required * requested_qty_by_menu_item[recipe.menu_item_id]
                )

            existing_reserved_rows = session.execute(
                select(ReservationIngredient).where(
                    ReservationIngredient.reservation_id == reservation_id
                )
            ).scalars().all()
            existing_ingredient_ids = {
                reserved_row.ingredient_id for reserved_row in existing_reserved_rows
            }
            ingredient_ids = sorted(
                existing_ingredient_ids.union(required_qty_by_ingredient.keys())
            )
            ingredients = session.execute(
                select(Ingredient)
                .where(Ingredient.id.in_(ingredient_ids))
                .order_by(Ingredient.id.asc())
                .with_for_update()
            ).scalars().all()
            ingredients_by_id = {ingredient.id: ingredient for ingredient in ingredients}

            active_reserved_rows = session.execute(
                select(
                    ReservationIngredient.ingredient_id,
                    func.coalesce(func.sum(ReservationIngredient.qty_reserved), 0),
                )
                .join(Reservation, Reservation.id == ReservationIngredient.reservation_id)
                .where(
                    ReservationIngredient.ingredient_id.in_(ingredient_ids),
                    Reservation.status == "active",
                    Reservation.expires_at > now,
                    Reservation.id != reservation_id,
                )
                .group_by(ReservationIngredient.ingredient_id)
            ).all()
            active_reserved_qty_by_ingredient = {
                ingredient_id: int(total_qty)
                for ingredient_id, total_qty in active_reserved_rows
            }

            insufficient_errors: list[dict[str, Any]] = []
            for ingredient_id, required_qty in sorted(required_qty_by_ingredient.items()):
                ingredient = ingredients_by_id[ingredient_id]
                active_reserved_qty = active_reserved_qty_by_ingredient.get(ingredient_id, 0)
                available_qty = 0 if ingredient.is_out else ingredient.on_hand_qty - active_reserved_qty
                if available_qty < required_qty:
                    insufficient_errors.append(
                        _build_insufficient_error(
                            ingredient=ingredient,
                            required_qty=required_qty,
                            available_qty=available_qty,
                        )
                    )

            if insufficient_errors:
                logger.warning(
                    "update_reservation conflict reservation_id=%s insufficient_count=%s",
                    reservation_id,
                    len(insufficient_errors),
                )
                return (
                    jsonify({"code": "INSUFFICIENT_INGREDIENTS", "errors": insufficient_errors}),
                    409,
                )

            session.execute(
                delete(ReservationItem).where(ReservationItem.reservation_id == reservation_id)
            )
            session.execute(
                delete(ReservationIngredient).where(
                    ReservationIngredient.reservation_id == reservation_id
                )
            )

            for item in normalized_items:
                session.add(
                    ReservationItem(
                        reservation_id=reservation_id,
                        menu_item_id=item["menu_item_id"],
                        qty=item["qty"],
                        notes=item["notes"],
                    )
                )

            for ingredient_id, qty_reserved in sorted(required_qty_by_ingredient.items()):
                session.add(
                    ReservationIngredient(
                        reservation_id=reservation_id,
                        ingredient_id=ingredient_id,
                        qty_reserved=qty_reserved,
                    )
                )

            reservation.expires_at = expires_at
            state_changed = True

    if state_changed:
        socketio.emit("stateChanged")
    logger.info(
        "update_reservation success reservation_id=%s expires_at=%s",
        reservation_id,
        expires_at.isoformat(),
    )
    return (
        jsonify(
            {
                "id": reservation_id,
                "status": "active",
                "expires_at": expires_at.isoformat(),
            }
        ),
        200,
    )


@reservations_bp.post("/reservations/<int:reservation_id>/commit")
@require_any_role("online", "foh")
def commit_reservation(reservation_id: int) -> tuple[dict[str, Any], int]:
    state_changed = False
    response_status_code = 200
    response_body: dict[str, Any]
    now = _utc_now()
    logger.info("commit_reservation start reservation_id=%s", reservation_id)

    with SessionLocal() as session:
        with session.begin():
            reservation = session.execute(
                select(Reservation)
                .where(Reservation.id == reservation_id)
                .with_for_update()
            ).scalar_one_or_none()
            if reservation is None:
                logger.warning("commit_reservation failed reservation_not_found reservation_id=%s", reservation_id)
                return jsonify({"error": "Reservation not found"}), 404

            if reservation.status == "committed":
                response_body = {"id": reservation.id, "status": reservation.status}
                logger.info("commit_reservation idempotent reservation_id=%s", reservation_id)
            elif reservation.status in {"released", "expired"}:
                logger.warning(
                    "commit_reservation failed reservation_id=%s status=%s",
                    reservation_id,
                    reservation.status,
                )
                return jsonify({"error": f"Reservation is {reservation.status}"}), 409
            elif reservation.expires_at <= now:
                reservation.status = "expired"
                response_status_code = 409
                response_body = {"error": "Reservation expired"}
                state_changed = True
                logger.warning("commit_reservation failed reservation_expired reservation_id=%s", reservation_id)
            elif reservation.status != "active":
                logger.warning(
                    "commit_reservation failed reservation_id=%s status=%s",
                    reservation_id,
                    reservation.status,
                )
                return jsonify({"error": f"Reservation is {reservation.status}"}), 409
            else:
                reservation_ingredients = session.execute(
                    select(ReservationIngredient)
                    .where(ReservationIngredient.reservation_id == reservation.id)
                ).scalars().all()
                ingredient_ids = sorted(
                    {
                        reservation_ingredient.ingredient_id
                        for reservation_ingredient in reservation_ingredients
                    }
                )
                ingredients = session.execute(
                    select(Ingredient)
                    .where(Ingredient.id.in_(ingredient_ids))
                    .order_by(Ingredient.id.asc())
                    .with_for_update()
                ).scalars().all()
                ingredients_by_id = {ingredient.id: ingredient for ingredient in ingredients}

                for reservation_ingredient in reservation_ingredients:
                    ingredient = ingredients_by_id[reservation_ingredient.ingredient_id]
                    next_on_hand_qty = ingredient.on_hand_qty - reservation_ingredient.qty_reserved
                    if next_on_hand_qty < 0:
                        raise RuntimeError(
                            f"Negative inventory for ingredient_id={ingredient.id} during commit"
                        )
                    ingredient.on_hand_qty = next_on_hand_qty

                reservation.status = "committed"
                response_body = {"id": reservation.id, "status": reservation.status}
                state_changed = True
                logger.info("commit_reservation success reservation_id=%s", reservation_id)

    if state_changed:
        socketio.emit("stateChanged")
    return jsonify(response_body), response_status_code


@reservations_bp.post("/reservations/<int:reservation_id>/release")
@require_any_role("online", "foh")
def release_reservation(reservation_id: int) -> tuple[dict[str, Any], int]:
    state_changed = False
    response_body: dict[str, Any]
    now = _utc_now()
    logger.info("release_reservation start reservation_id=%s", reservation_id)

    with SessionLocal() as session:
        with session.begin():
            reservation = session.execute(
                select(Reservation)
                .where(Reservation.id == reservation_id)
                .with_for_update()
            ).scalar_one_or_none()
            if reservation is None:
                logger.warning("release_reservation failed reservation_not_found reservation_id=%s", reservation_id)
                return jsonify({"error": "Reservation not found"}), 404

            if reservation.status == "committed":
                logger.warning("release_reservation failed reservation_committed reservation_id=%s", reservation_id)
                return jsonify({"error": "Reservation is committed"}), 409

            if reservation.status == "released":
                response_body = {"id": reservation.id, "status": reservation.status}
            elif reservation.status == "expired":
                response_body = {"id": reservation.id, "status": reservation.status}
            elif reservation.expires_at <= now:
                reservation.status = "expired"
                response_body = {"id": reservation.id, "status": reservation.status}
                state_changed = True
            elif reservation.status == "active":
                reservation.status = "released"
                response_body = {"id": reservation.id, "status": reservation.status}
                state_changed = True
            else:
                logger.warning(
                    "release_reservation failed reservation_id=%s status=%s",
                    reservation_id,
                    reservation.status,
                )
                return jsonify({"error": f"Reservation is {reservation.status}"}), 409

    if state_changed:
        socketio.emit("stateChanged")
    logger.info("release_reservation success reservation_id=%s status=%s", reservation_id, response_body["status"])
    return jsonify(response_body), 200
