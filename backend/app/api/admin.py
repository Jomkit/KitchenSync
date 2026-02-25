from __future__ import annotations

import logging
from typing import Any

from flask import Blueprint, g, jsonify, request

from app import socketio
from app.auth import require_any_role, require_role
from app.error_responses import error_response
from app.runtime_reservation_ttl import (
    MAX_TTL_SECONDS,
    MIN_TTL_SECONDS,
    get_runtime_ttl_info,
    set_runtime_ttl_seconds,
)
from app.runtime_reservation_warning import (
    MAX_WARNING_SECONDS,
    MIN_WARNING_SECONDS,
    get_runtime_warning_info,
    set_runtime_warning_threshold_seconds,
)

admin_bp = Blueprint("admin", __name__)
logger = logging.getLogger("kitchensync.api.admin")


def _serialize_ttl_payload(
    ttl_seconds: int,
    warning_threshold_seconds: int,
) -> dict[str, int]:
    return {
        "ttl_seconds": ttl_seconds,
        "ttl_minutes": ttl_seconds // 60,
        "min_seconds": MIN_TTL_SECONDS,
        "max_seconds": MAX_TTL_SECONDS,
        "min_minutes": MIN_TTL_SECONDS // 60,
        "max_minutes": MAX_TTL_SECONDS // 60,
        "warning_threshold_seconds": warning_threshold_seconds,
        "warning_min_seconds": MIN_WARNING_SECONDS,
        "warning_max_seconds": MAX_WARNING_SECONDS,
    }


@admin_bp.get("/admin/reservation-ttl")
@require_any_role("online", "foh")
def get_reservation_ttl() -> tuple[dict[str, int], int]:
    ttl_info = get_runtime_ttl_info()
    warning_info = get_runtime_warning_info()
    return jsonify(
        _serialize_ttl_payload(
            ttl_info.ttl_seconds,
            warning_info.warning_threshold_seconds,
        )
    ), 200


@admin_bp.patch("/admin/reservation-ttl")
@require_role("foh")
def update_reservation_ttl() -> tuple[dict[str, Any], int]:
    payload = request.get_json(silent=True) or {}
    ttl_minutes = payload.get("ttl_minutes")
    warning_threshold_seconds = payload.get("warning_threshold_seconds")
    if ttl_minutes is None and warning_threshold_seconds is None:
        return error_response("ttl_minutes or warning_threshold_seconds is required", 400, code="TTL_PAYLOAD_REQUIRED")
    if ttl_minutes is not None and (
        not isinstance(ttl_minutes, int) or isinstance(ttl_minutes, bool)
    ):
        return error_response("ttl_minutes must be an integer", 400, code="TTL_MINUTES_INVALID")
    if warning_threshold_seconds is not None and (
        not isinstance(warning_threshold_seconds, int)
        or isinstance(warning_threshold_seconds, bool)
    ):
        return error_response(
            "warning_threshold_seconds must be an integer",
            400,
            code="WARNING_THRESHOLD_INVALID",
        )

    old_ttl = get_runtime_ttl_info().ttl_seconds
    old_warning = get_runtime_warning_info().warning_threshold_seconds
    updated_ttl_seconds = old_ttl
    updated_warning_seconds = old_warning
    if ttl_minutes is not None:
        ttl_seconds = ttl_minutes * 60
        try:
            updated_ttl = set_runtime_ttl_seconds(ttl_seconds)
            updated_ttl_seconds = updated_ttl.ttl_seconds
        except ValueError:
            return error_response(
                (
                    f"ttl_minutes must be between "
                    f"{MIN_TTL_SECONDS // 60} and {MAX_TTL_SECONDS // 60}"
                ),
                400,
                code="TTL_MINUTES_OUT_OF_RANGE",
            )
    if warning_threshold_seconds is not None:
        try:
            updated_warning = set_runtime_warning_threshold_seconds(
                warning_threshold_seconds
            )
            updated_warning_seconds = updated_warning.warning_threshold_seconds
        except ValueError:
            return error_response(
                (
                    f"warning_threshold_seconds must be between "
                    f"{MIN_WARNING_SECONDS} and {MAX_WARNING_SECONDS}"
                ),
                400,
                code="WARNING_THRESHOLD_OUT_OF_RANGE",
            )

    claims = getattr(g, "jwt_claims", {})
    logger.info(
        (
            "reservation_ttl_or_warning updated actor_user_id=%s actor_role=%s "
            "old_ttl_seconds=%s new_ttl_seconds=%s old_warning_seconds=%s new_warning_seconds=%s"
        ),
        claims.get("sub"),
        claims.get("role"),
        old_ttl,
        updated_ttl_seconds,
        old_warning,
        updated_warning_seconds,
    )
    if old_ttl != updated_ttl_seconds or old_warning != updated_warning_seconds:
        socketio.emit("stateChanged")
    return jsonify(
        _serialize_ttl_payload(updated_ttl_seconds, updated_warning_seconds)
    ), 200
