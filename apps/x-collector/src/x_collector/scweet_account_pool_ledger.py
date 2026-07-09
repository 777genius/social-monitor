from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .account_pool import (
    AccountCapacity,
    AccountPoolLimits,
    AccountPoolSnapshot,
)


SCWEET_REUSABLE_ACCOUNT_STATUSES = (1, 401, 403, 404)
PRIORITY_ORDERING_BASE_OFFSET_SECONDS = 86_400


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

    def apply_profile_cooldowns(self, now: datetime) -> None:
        if self._db_path == ":memory:":
            return
        db_path = Path(self._db_path)
        if not db_path.exists():
            return

        observed_at = now.astimezone(UTC)
        today = observed_at.date().isoformat()
        reset_at = datetime(
            observed_at.year,
            observed_at.month,
            observed_at.day,
            tzinfo=UTC,
        ) + timedelta(days=1)
        reset_timestamp = reset_at.timestamp()

        try:
            with sqlite3.connect(db_path) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute(
                    """
                    SELECT
                      id,
                      username,
                      daily_requests,
                      daily_tweets,
                      last_reset_date,
                      available_til,
                      cooldown_reason
                    FROM accounts
                    ORDER BY id
                    """,
                ).fetchall()
                for row in rows:
                    username = read_string(row["username"]) or "<unknown>"
                    limits = self._limits.for_username(username)
                    usage_is_today = read_string(row["last_reset_date"]) == today
                    daily_requests = (
                        read_int(row["daily_requests"]) if usage_is_today else 0
                    )
                    daily_tweets = (
                        read_int(row["daily_tweets"]) if usage_is_today else 0
                    )
                    depleted = (
                        daily_requests >= limits.daily_requests
                        or daily_tweets >= limits.daily_tweets
                    )
                    if depleted:
                        connection.execute(
                            """
                            UPDATE accounts
                            SET available_til = max(coalesce(available_til, 0), ?),
                                cooldown_reason = 'profile_daily_limit'
                            WHERE id = ?
                            """,
                            (reset_timestamp, row["id"]),
                        )
                    elif read_string(row["cooldown_reason"]) == "profile_daily_limit":
                        connection.execute(
                            """
                            UPDATE accounts
                            SET available_til = NULL,
                                cooldown_reason = NULL
                            WHERE id = ?
                            """,
                            (row["id"],),
                        )
        except sqlite3.Error:
            return

    def apply_collection_priorities(self, now: datetime) -> None:
        if self._db_path == ":memory:":
            return
        db_path = Path(self._db_path)
        if not db_path.exists():
            return

        observed_at = now.astimezone(UTC)
        priority_base = (
            observed_at.timestamp() - PRIORITY_ORDERING_BASE_OFFSET_SECONDS
        )

        try:
            with sqlite3.connect(db_path) as connection:
                connection.row_factory = sqlite3.Row
                if not has_column(connection, "accounts", "last_used"):
                    return
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
                eligible = tuple(
                    account
                    for account in (
                        self._capacity_from_row(row, observed_at) for row in rows
                    )
                    if account.can_collect(
                        observed_at,
                        reusable_statuses=self._limits.reusable_statuses,
                    )
                )
                if len({account.priority for account in eligible}) <= 1:
                    return

                for account in eligible:
                    connection.execute(
                        """
                        UPDATE accounts
                        SET last_used = ?
                        WHERE id = ?
                        """,
                        (priority_base + account.priority, account.account_id),
                    )
        except sqlite3.Error:
            return

    def _capacity_from_row(
        self,
        row: sqlite3.Row,
        now: datetime,
    ) -> AccountCapacity:
        today = now.astimezone(UTC).date().isoformat()
        username = read_string(row["username"]) or "<unknown>"
        limits = self._limits.for_username(username)
        usage_is_today = read_string(row["last_reset_date"]) == today
        daily_requests = read_int(row["daily_requests"]) if usage_is_today else 0
        daily_tweets = read_int(row["daily_tweets"]) if usage_is_today else 0

        return AccountCapacity(
            account_id=read_int(row["id"]),
            username=username,
            status=read_int(row["status"]),
            daily_requests=daily_requests,
            daily_tweets=daily_tweets,
            daily_requests_limit=limits.daily_requests,
            daily_tweets_limit=limits.daily_tweets,
            priority=limits.priority,
            remaining_requests=max(limits.daily_requests - daily_requests, 0),
            remaining_tweets=max(limits.daily_tweets - daily_tweets, 0),
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


def has_column(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()

    return any(row[1] == column_name for row in rows)


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
