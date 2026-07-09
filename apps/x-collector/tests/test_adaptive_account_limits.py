from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from x_collector.account_pool import AccountLimitOverride, AccountPoolLimits
from x_collector.adaptive_account_limits import (
    AccountLimitObservation,
    AdaptiveAccountLimitPolicy,
    adapt_account_limit,
    adapt_account_pool_limits,
    read_sqlite_account_limit_observations,
)


def test_adaptive_limit_boosts_clean_high_usage_account() -> None:
    adapted = adapt_account_limit(
        AccountLimitOverride(daily_requests=120, daily_tweets=2_000, priority=0),
        AccountLimitObservation(daily_requests=113, daily_tweets=1_700),
        AdaptiveAccountLimitPolicy(enabled=True),
    )

    assert adapted == AccountLimitOverride(
        daily_requests=144,
        daily_tweets=2_400,
        priority=0,
    )


def test_adaptive_limit_does_not_boost_profile_cooldown() -> None:
    adapted = adapt_account_limit(
        AccountLimitOverride(daily_requests=30, daily_tweets=600, priority=100),
        AccountLimitObservation(
            daily_requests=30,
            daily_tweets=500,
            cooldown_reason="profile_daily_limit",
        ),
        AdaptiveAccountLimitPolicy(enabled=True),
    )

    assert adapted == AccountLimitOverride(
        daily_requests=30,
        daily_tweets=600,
        priority=100,
    )


def test_adaptive_limit_shrinks_after_provider_rate_limit() -> None:
    adapted = adapt_account_limit(
        AccountLimitOverride(daily_requests=120, daily_tweets=2_000, priority=0),
        AccountLimitObservation(
            daily_requests=82,
            daily_tweets=940,
            rate_limit_count=1,
        ),
        AdaptiveAccountLimitPolicy(enabled=True),
    )

    assert adapted == AccountLimitOverride(
        daily_requests=82,
        daily_tweets=940,
        priority=0,
    )


def test_adaptive_pool_limits_preserve_static_profiles_when_disabled() -> None:
    limits = AccountPoolLimits(
        daily_requests=30,
        daily_tweets=600,
        per_account={
            "premium": AccountLimitOverride(
                daily_requests=120,
                daily_tweets=2_000,
                priority=0,
            ),
        },
    )

    adapted = adapt_account_pool_limits(
        limits,
        {
            "premium": AccountLimitObservation(
                daily_requests=113,
                daily_tweets=1_700,
            ),
        },
        AdaptiveAccountLimitPolicy(enabled=False),
    )

    assert adapted is limits


def test_reads_observations_from_scweet_sqlite_state(tmp_path: Path) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_state(db_path)
    insert_account(
        db_path,
        username="premium",
        daily_requests=113,
        daily_tweets=1365,
        last_reset_date="2026-07-09",
    )
    insert_usage_event(
        db_path,
        username="premium",
        occurred_at="2026-07-09T13:35:24.845059+00:00",
        requests_after=113,
        tweets_after=1365,
        failure_kind=None,
        cooldown_reason=None,
    )
    insert_account(
        db_path,
        username="regular",
        daily_requests=65,
        daily_tweets=761,
        last_reset_date="2026-07-09",
        cooldown_reason="profile_daily_limit",
    )
    insert_usage_event(
        db_path,
        username="regular",
        occurred_at="2026-07-09T11:40:44.000000+00:00",
        requests_after=65,
        tweets_after=761,
        failure_kind="rate_limited",
        cooldown_reason="rate_limit",
    )

    observations = read_sqlite_account_limit_observations(
        str(db_path),
        datetime(2026, 7, 9, 14, tzinfo=UTC),
    )

    assert observations["premium"] == AccountLimitObservation(
        daily_requests=113,
        daily_tweets=1365,
    )
    assert observations["regular"] == AccountLimitObservation(
        daily_requests=65,
        daily_tweets=761,
        rate_limit_count=1,
        cooldown_reason="profile_daily_limit",
    )


def create_state(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.executescript(
            """
            CREATE TABLE accounts (
              id INTEGER PRIMARY KEY,
              username TEXT NOT NULL,
              daily_requests INTEGER NOT NULL,
              daily_tweets INTEGER NOT NULL,
              last_reset_date TEXT,
              cooldown_reason TEXT
            );
            CREATE TABLE account_usage_events (
              event_id TEXT PRIMARY KEY,
              username TEXT,
              occurred_at TEXT NOT NULL,
              requests_before INTEGER,
              requests_after INTEGER,
              tweets_before INTEGER,
              tweets_after INTEGER,
              failure_kind TEXT,
              cooldown_reason TEXT
            );
            """,
        )


def insert_account(
    db_path: Path,
    *,
    username: str,
    daily_requests: int,
    daily_tweets: int,
    last_reset_date: str,
    cooldown_reason: str | None = None,
) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO accounts (
              username, daily_requests, daily_tweets, last_reset_date,
              cooldown_reason
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                username,
                daily_requests,
                daily_tweets,
                last_reset_date,
                cooldown_reason,
            ),
        )


def insert_usage_event(
    db_path: Path,
    *,
    username: str,
    occurred_at: str,
    requests_after: int,
    tweets_after: int,
    failure_kind: str | None,
    cooldown_reason: str | None,
) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO account_usage_events (
              event_id, username, occurred_at, requests_before, requests_after,
              tweets_before, tweets_after, failure_kind, cooldown_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"event-{username}",
                username,
                occurred_at,
                max(requests_after - 1, 0),
                requests_after,
                max(tweets_after - 1, 0),
                tweets_after,
                failure_kind,
                cooldown_reason,
            ),
        )
