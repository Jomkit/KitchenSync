from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus


def _load_env_file(env_path: Path | None = None) -> None:
    file_path = env_path or Path(__file__).resolve().parent / ".env"
    if not file_path.exists():
        return

    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise RuntimeError(f"Environment variable {name} must be an integer, got: {value}") from exc


def _build_database_url_from_parts(
    *,
    prefix: str,
    default_host: str,
    default_port: str,
    default_name: str,
    strict: bool = False,
) -> str:
    driver = os.getenv(f"{prefix}_DRIVER", "postgresql+psycopg2")
    if strict:
        host = os.getenv(f"{prefix}_HOST")
        name = os.getenv(f"{prefix}_NAME")
        user = os.getenv(f"{prefix}_USER")
        password = os.getenv(f"{prefix}_PASSWORD")
        missing = [
            var_name
            for var_name, value in [
                (f"{prefix}_HOST", host),
                (f"{prefix}_NAME", name),
                (f"{prefix}_USER", user),
                (f"{prefix}_PASSWORD", password),
            ]
            if not value
        ]
        if missing:
            missing_vars = ", ".join(missing)
            raise RuntimeError(
                f"Missing required database environment variables: {missing_vars}. "
                "Set DATABASE_URL or provide all DB_* parts."
            )
        port = os.getenv(f"{prefix}_PORT", default_port)
    else:
        host = os.getenv(f"{prefix}_HOST", default_host)
        port = os.getenv(f"{prefix}_PORT", default_port)
        name = os.getenv(f"{prefix}_NAME", default_name)
        user = os.getenv(f"{prefix}_USER", "postgres")
        password = os.getenv(f"{prefix}_PASSWORD", "postgres")

    sslmode = os.getenv(f"{prefix}_SSLMODE")
    url = (
        f"{driver}://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{name}"
    )
    if sslmode:
        url = f"{url}?sslmode={quote_plus(sslmode)}"
    return url


def _resolve_database_url(app_env: str) -> str:
    is_strict_env = app_env in {"production", "staging"}

    if app_env == "test":
        test_url = os.getenv("TEST_DATABASE_URL")
        if test_url:
            return test_url
        return _build_database_url_from_parts(
            prefix="TEST_DB",
            default_host="localhost",
            default_port="5433",
            default_name="kitchensync_test",
        )

    direct_url = os.getenv("DATABASE_URL")
    if direct_url:
        return direct_url

    return _build_database_url_from_parts(
        prefix="DB",
        default_host="localhost",
        default_port="5432",
        default_name="kitchensync",
        strict=is_strict_env,
    )


@dataclass(frozen=True)
class Settings:
    app_env: str
    host: str
    port: int
    flask_debug: bool
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str
    jwt_access_token_ttl_minutes: int

    @classmethod
    def from_env(cls) -> "Settings":
        app_env = os.getenv("APP_ENV", "development").lower()
        return cls(
            app_env=app_env,
            host=os.getenv("HOST", "0.0.0.0"),
            port=_env_int("PORT", 5000),
            flask_debug=_env_bool("FLASK_DEBUG", False),
            database_url=_resolve_database_url(app_env),
            jwt_secret_key=os.getenv("JWT_SECRET_KEY", "dev-change-me"),
            jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
            jwt_access_token_ttl_minutes=_env_int("JWT_ACCESS_TOKEN_TTL_MINUTES", 60),
        )


_load_env_file()
settings = Settings.from_env()
