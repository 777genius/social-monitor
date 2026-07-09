from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping

from .account_pool import AccountLimitOverride, AccountPoolLimits


@dataclass(frozen=True)
class AccountLimitObservation:
    daily_requests: int
    daily_tweets: int
    rate_limit_count: int = 0
    cooldown_reason: str | None = None

    @property
    def has_provider_rate_limit(self) -> bool:
        return self.rate_limit_count > 0 or self.cooldown_reason == "rate_limit"

    @property
    def blocks_growth(self) -> bool:
        return self.cooldown_reason is not None


@dataclass(frozen=True)
class AdaptiveAccountLimitPolicy:
    enabled: bool = True
    high_watermark_ratio: float = 0.85
    clean_growth_ratio: float = 0.2
    max_growth_multiplier: float = 2.0


DEFAULT_ADAPTIVE_ACCOUNT_LIMIT_POLICY = AdaptiveAccountLimitPolicy()


def adapt_account_pool_limits(
    limits: AccountPoolLimits,
    observations: Mapping[str, AccountLimitObservation],
    policy: AdaptiveAccountLimitPolicy = DEFAULT_ADAPTIVE_ACCOUNT_LIMIT_POLICY,
) -> AccountPoolLimits:
    if not policy.enabled or not observations:
        return limits

    per_account = dict(limits.per_account or {})
    for username, observation in observations.items():
        normalized_username = username.strip().lower()
        if not normalized_username:
            continue
        base = limits.for_username(normalized_username)
        per_account[normalized_username] = adapt_account_limit(
            base,
            observation,
            policy,
        )

    return AccountPoolLimits(
        daily_requests=limits.daily_requests,
        daily_tweets=limits.daily_tweets,
        reusable_statuses=limits.reusable_statuses,
        per_account=per_account,
    )


def adapt_account_limit(
    base: AccountLimitOverride,
    observation: AccountLimitObservation,
    policy: AdaptiveAccountLimitPolicy = DEFAULT_ADAPTIVE_ACCOUNT_LIMIT_POLICY,
) -> AccountLimitOverride:
    if not policy.enabled:
        return base

    if observation.has_provider_rate_limit:
        return AccountLimitOverride(
            daily_requests=rate_limited_cap(
                configured=base.daily_requests,
                observed=observation.daily_requests,
            ),
            daily_tweets=rate_limited_cap(
                configured=base.daily_tweets,
                observed=observation.daily_tweets,
            ),
            priority=base.priority,
        )

    if observation.blocks_growth:
        return base

    return AccountLimitOverride(
        daily_requests=clean_usage_cap(
            configured=base.daily_requests,
            observed=observation.daily_requests,
            policy=policy,
        ),
        daily_tweets=clean_usage_cap(
            configured=base.daily_tweets,
            observed=observation.daily_tweets,
            policy=policy,
        ),
        priority=base.priority,
    )


def read_sqlite_account_limit_observations(
    db_path: str,
    now: datetime,
) -> dict[str, AccountLimitObservation]:
    if db_path == ":memory:":
        return {}
    path = Path(db_path)
    if not path.exists():
        return {}

    try:
        with sqlite3.connect(path) as connection:
            connection.row_factory = sqlite3.Row
            account_rows = read_account_rows(connection, now)
            event_rows = read_usage_event_rows(connection, now)
    except sqlite3.Error:
        return {}

    observations: dict[str, AccountLimitObservation] = {}
    for username, row in account_rows.items():
        event = event_rows.get(username)
        observations[username] = AccountLimitObservation(
            daily_requests=max(
                read_int(row["daily_requests"]),
                read_int(event["daily_requests"]) if event is not None else 0,
            ),
            daily_tweets=max(
                read_int(row["daily_tweets"]),
                read_int(event["daily_tweets"]) if event is not None else 0,
            ),
            rate_limit_count=read_int(event["rate_limit_count"])
            if event is not None
            else 0,
            cooldown_reason=read_string(row["cooldown_reason"]),
        )

    for username, row in event_rows.items():
        if username in observations:
            continue
        observations[username] = AccountLimitObservation(
            daily_requests=read_int(row["daily_requests"]),
            daily_tweets=read_int(row["daily_tweets"]),
            rate_limit_count=read_int(row["rate_limit_count"]),
        )

    return observations


def clean_usage_cap(
    *,
    configured: int,
    observed: int,
    policy: AdaptiveAccountLimitPolicy,
) -> int:
    if observed < configured * policy.high_watermark_ratio:
        return configured

    growth_cap = int(configured * (1 + policy.clean_growth_ratio))
    max_cap = int(configured * policy.max_growth_multiplier)

    return max(configured, min(max(growth_cap, configured + 1), max_cap))


def rate_limited_cap(*, configured: int, observed: int) -> int:
    if observed <= 0:
        return configured

    return max(1, min(configured, observed))


def read_account_rows(
    connection: sqlite3.Connection,
    now: datetime,
) -> dict[str, sqlite3.Row]:
    if not table_exists(connection, "accounts"):
        return {}
    today = now.astimezone(UTC).date().isoformat()
    rows = connection.execute(
        """
        SELECT
          lower(trim(username)) AS username,
          CASE WHEN last_reset_date = ? THEN daily_requests ELSE 0 END AS daily_requests,
          CASE WHEN last_reset_date = ? THEN daily_tweets ELSE 0 END AS daily_tweets,
          cooldown_reason
        FROM accounts
        WHERE username IS NOT NULL AND trim(username) <> ''
        """,
        (today, today),
    ).fetchall()

    return {read_string(row["username"]) or "": row for row in rows}


def read_usage_event_rows(
    connection: sqlite3.Connection,
    now: datetime,
) -> dict[str, sqlite3.Row]:
    if not table_exists(connection, "account_usage_events"):
        return {}
    columns = table_columns(connection, "account_usage_events")
    if "username" not in columns or "occurred_at" not in columns:
        return {}

    request_expr = max_existing_column(
        columns,
        "requests_after",
        "requests_before",
        fallback="0",
    )
    tweet_expr = max_existing_column(
        columns,
        "tweets_after",
        "tweets_before",
        fallback="0",
    )
    failure_expr = "failure_kind" if "failure_kind" in columns else "NULL"
    cooldown_expr = "cooldown_reason" if "cooldown_reason" in columns else "NULL"
    start, end = day_bounds(now)
    rows = connection.execute(
        f"""
        SELECT
          lower(trim(username)) AS username,
          max(coalesce({request_expr}, 0)) AS daily_requests,
          max(coalesce({tweet_expr}, 0)) AS daily_tweets,
          sum(
            CASE
              WHEN {failure_expr} = 'rate_limited' OR {cooldown_expr} = 'rate_limit'
              THEN 1 ELSE 0
            END
          ) AS rate_limit_count
        FROM account_usage_events
        WHERE username IS NOT NULL
          AND trim(username) <> ''
          AND occurred_at >= ?
          AND occurred_at < ?
        GROUP BY lower(trim(username))
        """,
        (start.isoformat(), end.isoformat()),
    ).fetchall()

    return {read_string(row["username"]) or "": row for row in rows}


def max_existing_column(
    columns: set[str],
    primary: str,
    secondary: str,
    *,
    fallback: str,
) -> str:
    values = [column for column in (primary, secondary) if column in columns]
    if not values:
        return fallback

    return ", ".join(values)


def day_bounds(now: datetime) -> tuple[datetime, datetime]:
    observed = now.astimezone(UTC)
    start = datetime(observed.year, observed.month, observed.day, tzinfo=UTC)

    return start, start + timedelta(days=1)


def table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()

    return row is not None


def table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()

    return {str(row[1]) for row in rows}


def read_int(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return max(value, 0)
    if isinstance(value, float):
        return max(int(value), 0)

    return 0


def read_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()

    return stripped or None
