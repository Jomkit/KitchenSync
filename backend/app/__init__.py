import logging
from pathlib import Path
from time import perf_counter

from flask import Flask, abort, g, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO

from config import settings

socketio = SocketIO(cors_allowed_origins=settings.cors_allowed_origins)
logger = logging.getLogger("kitchensync.app")


def create_app() -> Flask:
    frontend_dist_dir = Path(settings.frontend_dist_dir)
    app = Flask(
        __name__,
        static_folder=str(frontend_dist_dir) if frontend_dist_dir.exists() else None,
        static_url_path="/",
    )

    CORS(app, resources={r"/*": {"origins": settings.cors_allowed_origins}})

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

    @app.get("/healthz")
    def healthz() -> tuple[dict[str, str], int]:
        return jsonify({"status": "ok"}), 200

    from app import events  # noqa: F401
    from app.api import register_blueprints
    from app.auth import auth_bp

    register_blueprints(app)
    app.register_blueprint(auth_bp)
    socketio.init_app(app, async_mode="eventlet")

    api_prefixes = (
        "auth",
        "menu",
        "ingredients",
        "reservations",
        "internal",
        "health",
        "healthz",
        "socket.io",
    )

    @app.get("/")
    @app.get("/<path:path>")
    def serve_frontend(path: str = "index.html"):
        if not frontend_dist_dir.exists():
            abort(404)

        normalized_path = path.strip("/")
        if normalized_path and normalized_path.split("/", 1)[0] in api_prefixes:
            abort(404)

        candidate_path = frontend_dist_dir / normalized_path
        if normalized_path and candidate_path.exists() and candidate_path.is_file():
            return send_from_directory(frontend_dist_dir, normalized_path)

        return send_from_directory(frontend_dist_dir, "index.html")

    from app.reservation_expiration import start_reservation_expiration_job

    start_reservation_expiration_job()
    return app
