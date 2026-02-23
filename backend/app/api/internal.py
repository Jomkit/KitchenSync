from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from app.reservation_expiration import expire_reservations_once_and_emit
from config import settings

internal_bp = Blueprint("internal", __name__)
logger = logging.getLogger("kitchensync.api.internal")


@internal_bp.post("/internal/expire_once")
def expire_once() -> tuple[dict[str, int | str], int]:
    provided_secret = request.headers.get("X-Internal-Secret", "")
    if provided_secret != settings.internal_expire_secret:
        logger.warning("expire_once unauthorized")
        return jsonify({"error": "Unauthorized"}), 401

    expired_count = expire_reservations_once_and_emit()
    logger.info("expire_once executed expired_count=%s", expired_count)
    return jsonify({"status": "ok", "expired_count": expired_count}), 200
