from __future__ import annotations

from flask import g, jsonify


def _default_code_for_status(status_code: int) -> str:
    status_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        500: "INTERNAL_SERVER_ERROR",
    }
    return status_map.get(status_code, "REQUEST_FAILED")


def error_response(
    message: str,
    status_code: int,
    *,
    code: str | None = None,
) -> tuple[dict[str, str], int]:
    request_id = getattr(g, "request_id", "unknown")
    payload = {
        "error": message,
        "code": code or _default_code_for_status(status_code),
        "request_id": request_id,
    }
    return jsonify(payload), status_code
