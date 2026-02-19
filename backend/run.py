import os
import logging

from app import create_app, socketio

app = create_app()
logger = logging.getLogger("kitchensync.run")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"

    logger.info(
        "Starting SocketIO server host=%s port=%s debug=%s async_mode=%s",
        host,
        port,
        debug,
        socketio.async_mode or "auto",
    )
    logger.info("Health endpoint available at http://%s:%s/health", host, port)
    try:
        socketio.run(app, host=host, port=port, debug=debug, use_reloader=debug)
    except Exception:
        logger.exception("SocketIO server failed to start")
        raise
