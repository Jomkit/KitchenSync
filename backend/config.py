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


def _env_log_level(name: str, default: str) -> str:
    value = os.getenv(name, default).upper()
    allowed_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    if value not in allowed_levels:
        allowed = ", ".join(sorted(allowed_levels))
        raise RuntimeError(
            f"Environment variable {name} must be one of [{allowed}], got: {value}"
        )
    return value


def _env_csv(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


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
    reservation_ttl_seconds: int
    reservation_warning_threshold_seconds: int
    expiration_interval_seconds: int
    enable_inprocess_expiration_job: bool
    internal_expire_secret: str
    cors_allowed_origins: list[str]
    frontend_dist_dir: str
    log_level: str

    @classmethod
    def from_env(cls) -> "Settings":
        app_env = os.getenv("APP_ENV", "development").lower()
        internal_expire_secret = os.getenv("INTERNAL_EXPIRE_SECRET")
        if app_env in {"production", "staging"} and not internal_expire_secret:
            raise RuntimeError(
                "INTERNAL_EXPIRE_SECRET is required in production/staging."
            )

        frontend_dist_dir = os.getenv(
            "FRONTEND_DIST_DIR",
            str(Path(__file__).resolve().parent.parent / "frontend" / "dist"),
        )
        default_origins = ["*"] if app_env in {"production", "staging"} else ["http://localhost:5173"]
        warning_threshold_seconds = _env_int("RESERVATION_WARNING_THRESHOLD_SECONDS", 30)
        if warning_threshold_seconds < 5 or warning_threshold_seconds > 120:
            raise RuntimeError(
                "Environment variable RESERVATION_WARNING_THRESHOLD_SECONDS must be between 5 and 120"
            )

        return cls(
            app_env=app_env,
            host=os.getenv("HOST", "0.0.0.0"),
            port=_env_int("PORT", 5000),
            flask_debug=_env_bool("FLASK_DEBUG", False),
            database_url=_resolve_database_url(app_env),
            jwt_secret_key=os.getenv("JWT_SECRET_KEY", "dev-change-me"),
            jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
            jwt_access_token_ttl_minutes=_env_int("JWT_ACCESS_TOKEN_TTL_MINUTES", 60),
            reservation_ttl_seconds=_env_int("RESERVATION_TTL_SECONDS", 600),
            reservation_warning_threshold_seconds=warning_threshold_seconds,
            expiration_interval_seconds=_env_int("EXPIRATION_INTERVAL_SECONDS", 30),
            enable_inprocess_expiration_job=_env_bool(
                "ENABLE_INPROCESS_EXPIRATION_JOB",
                app_env not in {"production", "staging"},
            ),
            internal_expire_secret=internal_expire_secret or "dev-internal-secret",
            cors_allowed_origins=_env_csv("CORS_ALLOWED_ORIGINS", default_origins),
            frontend_dist_dir=frontend_dist_dir,
            log_level=_env_log_level("LOG_LEVEL", "INFO"),
        )


_load_env_file()
settings = Settings.from_env()
