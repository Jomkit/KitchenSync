from __future__ import annotations

from dataclasses import dataclass
from threading import Lock

from config import settings

MIN_TTL_SECONDS = 60
MAX_TTL_SECONDS = 15 * 60

_ttl_lock = Lock()
_runtime_ttl_seconds = settings.reservation_ttl_seconds


@dataclass(frozen=True)
class ReservationTtlInfo:
    ttl_seconds: int
    min_seconds: int = MIN_TTL_SECONDS
    max_seconds: int = MAX_TTL_SECONDS

    @property
    def ttl_minutes(self) -> int:
        return self.ttl_seconds // 60


def get_runtime_ttl_seconds() -> int:
    with _ttl_lock:
        return _runtime_ttl_seconds


def get_runtime_ttl_info() -> ReservationTtlInfo:
    return ReservationTtlInfo(ttl_seconds=get_runtime_ttl_seconds())


def set_runtime_ttl_seconds(ttl_seconds: int) -> ReservationTtlInfo:
    if ttl_seconds < MIN_TTL_SECONDS or ttl_seconds > MAX_TTL_SECONDS:
        raise ValueError(
            f"ttl_seconds must be between {MIN_TTL_SECONDS} and {MAX_TTL_SECONDS}"
        )

    with _ttl_lock:
        global _runtime_ttl_seconds
        _runtime_ttl_seconds = ttl_seconds
        return ReservationTtlInfo(ttl_seconds=_runtime_ttl_seconds)
