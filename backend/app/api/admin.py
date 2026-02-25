from __future__ import annotations

import logging
from typing import Any

from flask import Blueprint, g, jsonify, request

from app import socketio
from app.auth import require_role
from app.runtime_reservation_ttl import (
    MAX_TTL_SECONDS,
    MIN_TTL_SECONDS,
    get_runtime_ttl_info,
    set_runtime_ttl_seconds,
)

admin_bp = Blueprint("admin", __name__)
logger = logging.getLogger("kitchensync.api.admin")


def _serialize_ttl_payload(ttl_seconds: int) -> dict[str, int]:
    return {
        "ttl_seconds": ttl_seconds,
        "ttl_minutes": ttl_seconds // 60,
        "min_seconds": MIN_TTL_SECONDS,
        "max_seconds": MAX_TTL_SECONDS,
        "min_minutes": MIN_TTL_SECONDS // 60,
        "max_minutes": MAX_TTL_SECONDS // 60,
    }


@admin_bp.get("/admin/reservation-ttl")
@require_role("foh")
def get_reservation_ttl() -> tuple[dict[str, int], int]:
    ttl_info = get_runtime_ttl_info()
    return jsonify(_serialize_ttl_payload(ttl_info.ttl_seconds)), 200


@admin_bp.patch("/admin/reservation-ttl")
@require_role("foh")
def update_reservation_ttl() -> tuple[dict[str, Any], int]:
    payload = request.get_json(silent=True) or {}
    ttl_minutes = payload.get("ttl_minutes")
    if not isinstance(ttl_minutes, int) or isinstance(ttl_minutes, bool):
        return jsonify({"error": "ttl_minutes must be an integer"}), 400

    ttl_seconds = ttl_minutes * 60
    old_ttl = get_runtime_ttl_info().ttl_seconds
    try:
        updated_ttl = set_runtime_ttl_seconds(ttl_seconds)
    except ValueError:
        return (
            jsonify(
                {
                    "error": (
                        f"ttl_minutes must be between "
                        f"{MIN_TTL_SECONDS // 60} and {MAX_TTL_SECONDS // 60}"
                    )
                }
            ),
            400,
        )

    claims = getattr(g, "jwt_claims", {})
    logger.info(
        "reservation_ttl updated actor_user_id=%s actor_role=%s old_seconds=%s new_seconds=%s",
        claims.get("sub"),
        claims.get("role"),
        old_ttl,
        updated_ttl.ttl_seconds,
    )
    socketio.emit("stateChanged")
    return jsonify(_serialize_ttl_payload(updated_ttl.ttl_seconds)), 200
