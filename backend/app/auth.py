from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import wraps
import logging
from typing import Any, Callable, TypeVar

import jwt
from flask import Blueprint, g, jsonify, request
from sqlalchemy import select

from app.models import User
from config import settings
from db import SessionLocal

AuthHandler = TypeVar("AuthHandler", bound=Callable[..., Any])

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger("kitchensync.auth")


def _create_access_token(user: User) -> str:
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=settings.jwt_access_token_ttl_minutes)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def _unauthorized(message: str) -> tuple[dict[str, str], int]:
    return jsonify({"error": message}), 401


def _forbidden(message: str) -> tuple[dict[str, str], int]:
    return jsonify({"error": message}), 403


def _read_bearer_token() -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ", 1)[1].strip() or None


def require_jwt(handler: AuthHandler) -> AuthHandler:
    @wraps(handler)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        token = _read_bearer_token()
        if token is None:
            return _unauthorized("Missing bearer token")

        try:
            claims = _decode_access_token(token)
        except jwt.InvalidTokenError:
            return _unauthorized("Invalid access token")

        g.jwt_claims = claims
        return handler(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def require_role(role: str) -> Callable[[AuthHandler], AuthHandler]:
    def decorator(handler: AuthHandler) -> AuthHandler:
        @require_jwt
        @wraps(handler)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            claims = g.jwt_claims
            if claims.get("role") != role:
                return _forbidden(f"Role '{role}' is required")
            return handler(*args, **kwargs)

        return wrapped  # type: ignore[return-value]

    return decorator


@auth_bp.post("/auth/login")
def login() -> tuple[dict[str, Any], int]:
    payload = request.get_json(silent=True) or {}
    username = payload.get("username")
    password = payload.get("password")

    if not isinstance(username, str) or not isinstance(password, str):
        logger.warning("login failed invalid_payload")
        return jsonify({"error": "username and password are required"}), 400

    with SessionLocal() as session:
        user = session.execute(select(User).where(User.email == username)).scalar_one_or_none()

    if user is None or user.password != password:
        logger.warning("login failed invalid_credentials username=%s", username)
        return jsonify({"error": "Invalid credentials"}), 401

    access_token = _create_access_token(user)
    logger.info("login success user_id=%s role=%s", user.id, user.role)
    return jsonify({"access_token": access_token}), 200


@auth_bp.get("/auth/me")
@require_jwt
def me() -> tuple[dict[str, Any], int]:
    claims = g.jwt_claims
    return (
        jsonify(
            {
                "user_id": claims.get("sub"),
                "email": claims.get("email"),
                "role": claims.get("role"),
            }
        ),
        200,
    )


@auth_bp.get("/kitchen/overview")
@require_role("kitchen")
def kitchen_overview() -> tuple[dict[str, str], int]:
    return jsonify({"status": "kitchen access granted"}), 200


@auth_bp.get("/foh/overview")
@require_role("foh")
def foh_overview() -> tuple[dict[str, str], int]:
    return jsonify({"status": "foh access granted"}), 200
