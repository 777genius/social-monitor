from __future__ import annotations

import re
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .domain import (
    XCollectorAuthError,
    XCollectorRateLimitError,
    XCollectorUnavailableError,
)
from .ports import Clock


def classify_scweet_error(
    exc: Exception,
    *,
    clock: Clock,
    scweet_db_path: str | None = None,
) -> Exception:
    message = str(exc).lower()

    if any(token in message for token in ["auth", "cookie", "token", "401"]):
        return XCollectorAuthError("Scweet authentication failed")

    if any(
        token in message
        for token in ["rate", "limit", "cooldown", "daily cap", "429"]
    ):
        now = clock.now()
        reset_at = (
            rate_limit_reset_from_message(str(exc))
            or rate_limit_reset_from_scweet_db(scweet_db_path, now)
            or now + timedelta(minutes=15)
        )
        retry_after_ms = max(
            1,
            int((reset_at - now).total_seconds() * 1000),
        )
        return XCollectorRateLimitError(
            "Scweet rate limit reached",
            retry_after_ms=retry_after_ms,
            reset_at=reset_at,
        )

    return XCollectorUnavailableError("Scweet collection failed")


def rate_limit_reset_from_message(message: str) -> datetime | None:
    match = re.search(r"\breset=(\d{10,})\b", message)
    if match is None:
        return None

    return datetime.fromtimestamp(int(match.group(1)), UTC)


def rate_limit_reset_from_scweet_db(
    scweet_db_path: str | None,
    now: datetime,
) -> datetime | None:
    if scweet_db_path is None or scweet_db_path == ":memory:":
        return None
    if not Path(scweet_db_path).exists():
        return None

    try:
        with sqlite3.connect(scweet_db_path) as connection:
            row = connection.execute(
                """
                SELECT MAX(available_til)
                FROM accounts
                WHERE cooldown_reason = 'rate_limit'
                  AND available_til IS NOT NULL
                """,
            ).fetchone()
    except sqlite3.Error:
        return None

    value = row[0] if row is not None else None
    if not isinstance(value, (int, float)):
        return None

    reset_at = datetime.fromtimestamp(float(value), UTC)
    if reset_at <= now or reset_at > now + timedelta(hours=24):
        return None

    return reset_at
