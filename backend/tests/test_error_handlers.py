from __future__ import annotations

from app import create_app


def test_unknown_api_route_returns_json_error_with_request_id(app_client) -> None:
    response = app_client.get("/auth/not-a-route")

    assert response.status_code == 404
    body = response.get_json()
    assert isinstance(body, dict)
    assert body["error"]
    assert body["code"] == "NOT_FOUND"
    assert body["request_id"]


def test_unhandled_api_exception_returns_json_error_with_request_id() -> None:
    app = create_app()
    app.config["TESTING"] = False

    @app.get("/internal/test-raise")
    def _raise_error():
        raise RuntimeError("boom")

    with app.test_client() as client:
        response = client.get("/internal/test-raise")

    assert response.status_code == 500
    body = response.get_json()
    assert isinstance(body, dict)
    assert body["error"] == "Internal server error"
    assert body["code"] == "INTERNAL_SERVER_ERROR"
    assert body["request_id"]
