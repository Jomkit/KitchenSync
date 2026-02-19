from flask_socketio import emit

from app import socketio


@socketio.on("ping")
def handle_ping(data: dict | None = None) -> None:
    emit("pong", data or {})
