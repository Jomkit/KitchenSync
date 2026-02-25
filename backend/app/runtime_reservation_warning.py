from __future__ import annotations

from dataclasses import dataclass
from threading import Lock

from config import settings

MIN_WARNING_SECONDS = 5
MAX_WARNING_SECONDS = 120

_warning_lock = Lock()
_runtime_warning_threshold_seconds = settings.reservation_warning_threshold_seconds


@dataclass(frozen=True)
class ReservationWarningInfo:
    warning_threshold_seconds: int
    min_seconds: int = MIN_WARNING_SECONDS
    max_seconds: int = MAX_WARNING_SECONDS


def get_runtime_warning_threshold_seconds() -> int:
    with _warning_lock:
        return _runtime_warning_threshold_seconds


def get_runtime_warning_info() -> ReservationWarningInfo:
    return ReservationWarningInfo(
        warning_threshold_seconds=get_runtime_warning_threshold_seconds()
    )


def set_runtime_warning_threshold_seconds(
    warning_threshold_seconds: int,
) -> ReservationWarningInfo:
    if (
        warning_threshold_seconds < MIN_WARNING_SECONDS
        or warning_threshold_seconds > MAX_WARNING_SECONDS
    ):
        raise ValueError(
            f"warning_threshold_seconds must be between "
            f"{MIN_WARNING_SECONDS} and {MAX_WARNING_SECONDS}"
        )

    with _warning_lock:
        global _runtime_warning_threshold_seconds
        _runtime_warning_threshold_seconds = warning_threshold_seconds
        return ReservationWarningInfo(
            warning_threshold_seconds=_runtime_warning_threshold_seconds
        )
