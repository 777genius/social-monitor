from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable

from x_collector.account_pool import AccountPoolLimits
from x_collector.account_usage_observer import AccountUsageObserver
from x_collector.domain import DailySearchRequest, SearchProduct
from x_collector.scweet_account_pool_ledger import ScweetAccountPoolLedger
from x_collector.scweet_adapter import ScweetDailySearchCollector
from x_collector.sqlite_account_usage_event_repository import (
    SqliteAccountUsageEventRepository,
)


@dataclass(frozen=True)
class FixedClock:
    value: datetime

    def now(self) -> datetime:
        return self.value


def test_collect_daily_search_records_audit_only_account_usage_events(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_scweet_accounts_table(db_path)
    insert_scweet_account(db_path, daily_requests=0, daily_tweets=0)
    clock = FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC))
    collector = collector_with_observability(
        db_path,
        DbUpdatingScweet(db_path),
        clock,
    )

    result = collector.collect_daily_search(request(max_items=2))

    assert [post.tweet_id for post in result.posts] == ["300", "200"]
    rows = account_usage_event_rows(db_path)
    event_types = [row["event_type"] for row in rows]
    assert "budget_snapshot" in event_types
    assert event_types.count("pass_started") == 3
    assert event_types.count("pass_succeeded") == 3
    succeeded = [
        row for row in rows
        if row["event_type"] == "pass_succeeded"
    ]
    assert succeeded[0]["account_id"] == 1
    assert succeeded[0]["requests_before"] == 0
    assert succeeded[0]["requests_after"] == 1
    assert succeeded[0]["daily_requests_limit"] == 30
    assert succeeded[0]["daily_tweets_limit"] == 600
    assert succeeded[0]["account_priority"] == 100
    assert succeeded[0]["tweets_before"] == 0
    assert succeeded[0]["tweets_after"] == 2
    assert succeeded[0]["fetched_count"] == 2
    assert succeeded[0]["accepted_count"] == 2


def test_account_usage_observer_failures_do_not_break_collection(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_scweet_accounts_table(db_path)
    insert_scweet_account(db_path, daily_requests=0, daily_tweets=0)
    ledger = ScweetAccountPoolLedger(
        str(db_path),
        AccountPoolLimits(daily_requests=30, daily_tweets=600),
    )
    observer = AccountUsageObserver(
        ledger,
        BrokenAccountUsageEventRepository(),
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
    )
    collector = ScweetDailySearchCollector(
        lambda: DbUpdatingScweet(db_path),
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
        str(db_path),
        ledger,
        account_usage_observer=observer,
    )

    result = collector.collect_daily_search(request(max_items=1))

    assert [post.tweet_id for post in result.posts] == ["300"]


def test_collect_daily_search_records_rate_limit_cooldown_events(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_scweet_accounts_table(db_path)
    insert_scweet_account(db_path, daily_requests=0, daily_tweets=0)
    clock = FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC))
    reset_at = datetime(2026, 6, 27, 12, 15, tzinfo=UTC)
    collector = collector_with_observability(
        db_path,
        RateLimitedAfterFirstPassScweet(db_path, reset_at),
        clock,
    )

    result = collector.collect_daily_search(request(max_items=5))

    assert [post.tweet_id for post in result.posts] == ["200", "100"]
    rows = account_usage_event_rows(db_path)
    failed = [
        row for row in rows
        if row["event_type"] == "pass_failed"
    ]
    cooldowns = [
        row for row in rows
        if row["event_type"] == "cooldown_observed"
    ]
    assert failed[0]["account_id"] == 1
    assert failed[0]["failure_kind"] == "rate_limited"
    assert failed[0]["cooldown_reason"] == "rate_limit"
    assert failed[0]["reset_at"] == reset_at.isoformat()
    assert cooldowns[0]["account_id"] == 1
    assert cooldowns[0]["cooldown_reason"] == "rate_limit"


class DbUpdatingScweet:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self.calls: list[dict[str, object]] = []

    def search(self, query: str, **kwargs: object) -> list[dict[str, object]]:
        self.calls.append({"query": query, **kwargs})
        records = tweets_for_product(str(kwargs["display_type"]))
        increment_account_usage(self._db_path, request_count=1, tweet_count=len(records))

        return records


class RateLimitedAfterFirstPassScweet:
    def __init__(self, db_path: Path, reset_at: datetime) -> None:
        self._db_path = db_path
        self._reset_at = reset_at
        self.calls = 0

    def search(self, *_: object, **kwargs: object) -> list[dict[str, object]]:
        self.calls += 1
        if self.calls > 1:
            increment_account_usage(
                self._db_path,
                request_count=1,
                tweet_count=0,
                available_til=self._reset_at.timestamp(),
                cooldown_reason="rate_limit",
            )
            raise RuntimeError("rate limit exceeded")

        records = tweets_for_product(str(kwargs["display_type"]))
        increment_account_usage(self._db_path, request_count=1, tweet_count=len(records))

        return records


class BrokenAccountUsageEventRepository:
    def append_events(self, events: object) -> None:
        del events
        raise sqlite3.Error("observability store unavailable")


def collector_with_observability(
    db_path: Path,
    scweet: object,
    clock: FixedClock,
) -> ScweetDailySearchCollector:
    ledger = ScweetAccountPoolLedger(
        str(db_path),
        AccountPoolLimits(daily_requests=30, daily_tweets=600),
    )
    observer = AccountUsageObserver(
        ledger,
        SqliteAccountUsageEventRepository(str(db_path)),
        clock,
        event_id_factory=event_id_factory(),
    )

    return ScweetDailySearchCollector(
        lambda: scweet,
        clock,
        str(db_path),
        ledger,
        account_usage_observer=observer,
    )


def event_id_factory() -> Callable[[], str]:
    next_id = 0

    def create() -> str:
        nonlocal next_id
        next_id += 1
        return f"event-{next_id}"

    return create


def request(*, max_items: int) -> DailySearchRequest:
    return DailySearchRequest(
        request_id="scan-1",
        tenant_id="tenant-1",
        workspace_id="workspace-1",
        source_binding_id="binding-1",
        scan_job_id="scan-1",
        correlation_id="corr-1",
        query="AI agents",
        language="en",
        window_hours=24,
        window_end=datetime(2026, 6, 27, 12, tzinfo=UTC),
        search_products=(SearchProduct.TOP,),
        limit_per_product=10,
        max_items=max_items,
        min_likes=5,
        min_retweets=None,
        min_replies=None,
        cursor=None,
    )


def tweets_for_product(product: str) -> list[dict[str, object]]:
    if product == "Latest":
        return [
            tweet("100", likes=1, retweets=0, comments=0),
            tweet("300", likes=5, retweets=20, comments=0),
        ]

    return [
        tweet("100", likes=10, retweets=1, comments=1),
        tweet("200", likes=20, retweets=2, comments=0),
    ]


def tweet(
    tweet_id: str,
    *,
    likes: int,
    retweets: int,
    comments: int,
) -> dict[str, object]:
    return {
        "tweet_id": tweet_id,
        "timestamp": "Sat Jun 27 11:30:00 +0000 2026",
        "user": {"screen_name": "builder", "name": "Builder"},
        "text": f"Post {tweet_id}",
        "likes": likes,
        "retweets": retweets,
        "comments": comments,
        "tweet_url": f"https://x.com/builder/status/{tweet_id}",
        "media": {"image_links": [f"https://cdn.example/{tweet_id}.jpg"]},
    }


def create_scweet_accounts_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE accounts (
              id INTEGER NOT NULL PRIMARY KEY,
              username VARCHAR(255) NOT NULL,
              status INTEGER NOT NULL,
              available_til FLOAT,
              lease_expires_at FLOAT,
              busy BOOLEAN NOT NULL,
              daily_requests INTEGER NOT NULL,
              daily_tweets INTEGER NOT NULL,
              last_reset_date VARCHAR(10),
              lease_id VARCHAR(64),
              cooldown_reason VARCHAR(128)
            )
            """,
        )


def insert_scweet_account(
    db_path: Path,
    *,
    daily_requests: int,
    daily_tweets: int,
) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO accounts (
              id,
              username,
              status,
              available_til,
              lease_expires_at,
              busy,
              daily_requests,
              daily_tweets,
              last_reset_date,
              lease_id,
              cooldown_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "research-1",
                1,
                0.0,
                0.0,
                False,
                daily_requests,
                daily_tweets,
                "2026-06-27",
                None,
                None,
            ),
        )


def increment_account_usage(
    db_path: Path,
    *,
    request_count: int,
    tweet_count: int,
    available_til: float = 0.0,
    cooldown_reason: str | None = None,
) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            UPDATE accounts
            SET daily_requests = daily_requests + ?,
                daily_tweets = daily_tweets + ?,
                available_til = ?,
                cooldown_reason = ?
            WHERE id = 1
            """,
            (request_count, tweet_count, available_til, cooldown_reason),
        )


def account_usage_event_rows(db_path: Path) -> list[sqlite3.Row]:
    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        return list(
            connection.execute(
                """
                SELECT *
                FROM account_usage_events
                ORDER BY rowid
                """,
            ),
        )
