import logging
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from flask import Flask, abort, g, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.exceptions import HTTPException

from config import settings
from app.error_responses import error_response

socketio = SocketIO(cors_allowed_origins=settings.cors_allowed_origins)
logger = logging.getLogger("kitchensync.app")


def create_app() -> Flask:
    frontend_dist_dir = Path(settings.frontend_dist_dir)
    # Do not mount Flask's built-in static route at "/" because it conflicts with
    # SPA client-side routes (for example, refreshing "/online").
    app = Flask(__name__, static_folder=None)

    CORS(app, resources={r"/*": {"origins": settings.cors_allowed_origins}})

    @app.before_request
    def _track_request_start() -> None:
        g.request_started_at = perf_counter()
        g.request_id = request.headers.get("X-Request-Id") or str(uuid4())

    @app.after_request
    def _log_request(response):  # type: ignore[no-untyped-def]
        started_at = getattr(g, "request_started_at", None)
        request_id = getattr(g, "request_id", "unknown")
        duration_ms = (perf_counter() - started_at) * 1000 if started_at is not None else -1
        logger.info(
            "request method=%s path=%s status=%s duration_ms=%.2f request_id=%s",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        response.headers["X-Request-Id"] = request_id
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

    def _is_api_request(path: str) -> bool:
        return path.startswith(
            (
                "/auth",
                "/menu",
                "/ingredients",
                "/reservations",
                "/admin",
                "/internal",
                "/health",
                "/healthz",
                "/socket.io",
            )
        )

    @app.errorhandler(HTTPException)
    def _handle_http_exception(error: HTTPException):  # type: ignore[no-untyped-def]
        if _is_api_request(request.path):
            return error_response(
                error.description or error.name,
                error.code or 500,
                code=(error.name or "HTTP_ERROR").upper().replace(" ", "_"),
            )
        return error

    @app.errorhandler(Exception)
    def _handle_exception(error: Exception):  # type: ignore[no-untyped-def]
        logger.exception(
            "unhandled_exception path=%s request_id=%s",
            request.path,
            getattr(g, "request_id", "unknown"),
        )
        if _is_api_request(request.path):
            return error_response("Internal server error", 500)
        return jsonify({"error": "Internal server error"}), 500

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
