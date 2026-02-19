from __future__ import annotations

import os
from datetime import datetime, timezone

import eventlet
from sqlalchemy import select

from app import socketio
from app.models import Reservation
from config import settings
from db import SessionLocal

EXPIRATION_INTERVAL_SECONDS = 30
_expiration_job_started = False


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def expire_reservations_once(now: datetime | None = None) -> int:
    effective_now = now or _utc_now()

    with SessionLocal() as session:
        with session.begin():
            expired_reservations = session.execute(
                select(Reservation)
                .where(
                    Reservation.status == "active",
                    Reservation.expires_at < effective_now,
                )
                .with_for_update()
            ).scalars().all()

            for reservation in expired_reservations:
                reservation.status = "expired"

            return len(expired_reservations)


def expire_reservations_once_and_emit(now: datetime | None = None) -> int:
    expired_count = expire_reservations_once(now=now)
    if expired_count > 0:
        socketio.emit("stateChanged")
    return expired_count


def _should_start_expiration_job() -> bool:
    if settings.app_env == "test":
        return False
    if settings.flask_debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return False
    return True


def _reservation_expiration_loop() -> None:
    while True:
        expire_reservations_once_and_emit()
        eventlet.sleep(EXPIRATION_INTERVAL_SECONDS)


def start_reservation_expiration_job() -> None:
    global _expiration_job_started

    if _expiration_job_started or not _should_start_expiration_job():
        return

    _expiration_job_started = True
    socketio.start_background_task(_reservation_expiration_loop)
