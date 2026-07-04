from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .account_pool import (
    AccountCapacity,
    AccountPoolLimits,
    AccountPoolSnapshot,
)


SCWEET_REUSABLE_ACCOUNT_STATUSES = (1, 401, 403, 404)


class ScweetAccountPoolLedger:
    def __init__(
        self,
        db_path: str,
        limits: AccountPoolLimits,
    ) -> None:
        self._db_path = db_path
        self._limits = limits

    def snapshot(self, now: datetime) -> AccountPoolSnapshot | None:
        if self._db_path == ":memory:":
            return None
        db_path = Path(self._db_path)
        if not db_path.exists():
            return None

        try:
            with sqlite3.connect(db_path) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute(
                    """
                    SELECT
                      id,
                      username,
                      status,
                      daily_requests,
                      daily_tweets,
                      last_reset_date,
                      available_til,
                      lease_id,
                      lease_expires_at,
                      busy,
                      cooldown_reason
                    FROM accounts
                    ORDER BY id
                    """,
                ).fetchall()
        except sqlite3.Error:
            return None

        return AccountPoolSnapshot(
            observed_at=now.astimezone(UTC),
            limits=self._limits,
            accounts=tuple(self._capacity_from_row(row, now) for row in rows),
        )

    def _capacity_from_row(
        self,
        row: sqlite3.Row,
        now: datetime,
    ) -> AccountCapacity:
        today = now.astimezone(UTC).date().isoformat()
        usage_is_today = read_string(row["last_reset_date"]) == today
        daily_requests = read_int(row["daily_requests"]) if usage_is_today else 0
        daily_tweets = read_int(row["daily_tweets"]) if usage_is_today else 0

        return AccountCapacity(
            account_id=read_int(row["id"]),
            username=read_string(row["username"]) or "<unknown>",
            status=read_int(row["status"]),
            daily_requests=daily_requests,
            daily_tweets=daily_tweets,
            remaining_requests=max(
                self._limits.daily_requests - daily_requests,
                0,
            ),
            remaining_tweets=max(self._limits.daily_tweets - daily_tweets, 0),
            available_at=timestamp_to_datetime(row["available_til"]),
            lease_id=read_string(row["lease_id"]),
            lease_expires_at=timestamp_to_datetime(row["lease_expires_at"]),
            busy=bool(row["busy"]),
            cooldown_reason=read_string(row["cooldown_reason"]),
        )


def timestamp_to_datetime(value: Any) -> datetime | None:
    if not isinstance(value, (int, float)) or value <= 0:
        return None

    return datetime.fromtimestamp(float(value), UTC)


def read_int(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return max(value, 0)

    return 0


def read_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()

    return stripped or None
