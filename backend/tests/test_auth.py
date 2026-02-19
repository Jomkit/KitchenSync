from __future__ import annotations


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.get_json()["access_token"]


def test_login_success_returns_access_token(app_client) -> None:
    response = app_client.post(
        "/auth/login",
        json={"username": "kitchen@example.com", "password": "pass"},
    )

    body = response.get_json()
    assert response.status_code == 200
    assert isinstance(body.get("access_token"), str)


def test_login_failure_returns_401(app_client) -> None:
    response = app_client.post(
        "/auth/login",
        json={"username": "kitchen@example.com", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.get_json()["error"] == "Invalid credentials"


def test_role_guard_denies_mismatched_role(app_client) -> None:
    token = _login(app_client, "foh@example.com", "pass")
    response = app_client.get(
        "/kitchen/overview",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.get_json()["error"] == "Role 'kitchen' is required"


def test_role_guard_permits_matching_role(app_client) -> None:
    token = _login(app_client, "kitchen@example.com", "pass")
    response = app_client.get(
        "/kitchen/overview",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.get_json()["status"] == "kitchen access granted"
