import logging

from flask_socketio import emit

from app import socketio

logger = logging.getLogger("kitchensync.events")


@socketio.on("ping")
def handle_ping(data: dict | None = None) -> None:
    logger.debug("socket ping received")
    emit("pong", data or {})
