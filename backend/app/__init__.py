from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO

socketio = SocketIO(cors_allowed_origins=["http://localhost:5173"])


def create_app() -> Flask:
    app = Flask(__name__)

    CORS(app, resources={r"/*": {"origins": ["http://localhost:5173"]}})

    @app.get("/health")
    def health() -> tuple[dict[str, str], int]:
        return jsonify({"status": "ok"}), 200

    from app import events  # noqa: F401

    socketio.init_app(app, async_mode="eventlet")
    return app
