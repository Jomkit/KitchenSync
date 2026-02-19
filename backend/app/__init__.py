import logging
from time import perf_counter

from flask import Flask, g, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO

socketio = SocketIO(cors_allowed_origins=["http://localhost:5173"])
logger = logging.getLogger("kitchensync.app")


def create_app() -> Flask:
    app = Flask(__name__)

    CORS(app, resources={r"/*": {"origins": ["http://localhost:5173"]}})

    @app.before_request
    def _track_request_start() -> None:
        g.request_started_at = perf_counter()

    @app.after_request
    def _log_request(response):  # type: ignore[no-untyped-def]
        started_at = getattr(g, "request_started_at", None)
        duration_ms = (perf_counter() - started_at) * 1000 if started_at is not None else -1
        logger.info(
            "request method=%s path=%s status=%s duration_ms=%.2f",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
        )
        return response

    @app.get("/health")
    def health() -> tuple[dict[str, str], int]:
        return jsonify({"status": "ok"}), 200

    from app import events  # noqa: F401
    from app.api import register_blueprints
    from app.auth import auth_bp

    register_blueprints(app)
    app.register_blueprint(auth_bp)
    socketio.init_app(app, async_mode="eventlet")

    from app.reservation_expiration import start_reservation_expiration_job

    start_reservation_expiration_job()
    return app
