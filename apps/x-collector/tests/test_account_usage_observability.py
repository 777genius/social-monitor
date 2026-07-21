from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier
from typing import Callable

from x_collector.account_pool import AccountPoolLimits
from x_collector.account_usage import AccountUsageEvent, AccountUsageEventType
from x_collector.account_usage_observer import (
    OVERLAPS_PASS_OBSERVATION_WINDOW,
    AccountUsageObserver,
)
from x_collector.domain import DailySearchRequest, SearchProduct
from x_collector.scweet_account_pool_ledger import ScweetAccountPoolLedger
from x_collector.scweet_adapter import ScweetDailySearchCollector
from x_collector.sqlite_account_usage_event_repository import (
    SqliteAccountUsageEventRepository,
    account_usage_events_schema,
    ensure_account_usage_events_schema,
)


@dataclass(frozen=True)
class FixedClock:
    value: datetime

    def now(self) -> datetime:
        return self.value


def test_existing_event_schema_adds_observation_columns(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "scweet_state.db"
    legacy_schema = account_usage_events_schema().replace(
        "      pass_observation_id TEXT,\n",
        "",
    ).replace(
        "      observation_relation TEXT,\n",
        "",
    ).replace(
        "      collector_run_id TEXT,\n",
        "",
    )
    with sqlite3.connect(db_path) as connection:
        connection.execute(legacy_schema)
        ensure_account_usage_events_schema(connection)
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(account_usage_events)",
            )
        }

    assert "pass_observation_id" in columns
    assert "observation_relation" in columns
    assert "collector_run_id" in columns


def test_concurrent_first_schema_initialization_is_safe(tmp_path: Path) -> None:
    db_path = tmp_path / "scweet_state.db"
    worker_count = append_events_concurrently(db_path)

    rows = account_usage_event_rows(db_path)
    assert len(rows) == worker_count
    assert {row["event_id"] for row in rows} == {
        f"concurrent-event-{index}" for index in range(worker_count)
    }
    with sqlite3.connect(db_path) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        assert integrity == ("ok",)
        indexes = {
            row[1]
            for row in connection.execute(
                "PRAGMA index_list(account_usage_events)",
            )
        }
    assert "idx_account_usage_events_pass_observation" in indexes
    assert "idx_account_usage_events_collector_run" in indexes


def test_concurrent_legacy_schema_migration_is_safe(tmp_path: Path) -> None:
    db_path = tmp_path / "scweet_state.db"
    legacy_schema = account_usage_events_schema().replace(
        "      pass_observation_id TEXT,\n",
        "",
    ).replace(
        "      observation_relation TEXT,\n",
        "",
    ).replace(
        "      collector_run_id TEXT,\n",
        "",
    )
    with sqlite3.connect(db_path) as connection:
        connection.execute(legacy_schema)

    worker_count = append_events_concurrently(db_path)

    rows = account_usage_event_rows(db_path)
    assert len(rows) == worker_count
    assert all(row["pass_observation_id"] is not None for row in rows)
    with sqlite3.connect(db_path) as connection:
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(account_usage_events)",
            )
        }
    assert {
        "pass_observation_id",
        "observation_relation",
        "collector_run_id",
    } <= columns


def test_reused_account_records_one_result_and_state_delta_per_pass(
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
    state_deltas = [
        row for row in rows
        if row["event_type"] == "account_state_delta_observed"
    ]
    assert succeeded[0]["account_id"] is None
    assert succeeded[0]["requests_before"] is None
    assert succeeded[0]["requests_after"] is None
    assert succeeded[0]["daily_requests_limit"] is None
    assert succeeded[0]["daily_tweets_limit"] is None
    assert succeeded[0]["account_priority"] is None
    assert succeeded[0]["tweets_before"] is None
    assert succeeded[0]["tweets_after"] is None
    assert succeeded[0]["fetched_count"] == 2
    assert succeeded[0]["accepted_count"] == 2
    assert succeeded[0]["attribution_status"] == "unknown"
    assert len(state_deltas) == 3
    assert {row["account_id"] for row in state_deltas} == {1}
    assert {row["attribution_status"] for row in state_deltas} == {"unknown"}
    assert {row["observation_relation"] for row in state_deltas} == {
        OVERLAPS_PASS_OBSERVATION_WINDOW,
    }
    assert all(row["fetched_count"] is None for row in state_deltas)
    assert all(row["accepted_count"] is None for row in state_deltas)
    assert {
        row["pass_observation_id"] for row in state_deltas
    } == {
        row["pass_observation_id"] for row in succeeded
    }
    assert len({row["pass_observation_id"] for row in succeeded}) == 3
    assert sum(
        row["requests_after"] - row["requests_before"]
        for row in state_deltas
    ) == 3
    assert sum(
        row["tweets_after"] - row["tweets_before"]
        for row in state_deltas
    ) == 6
    assert sum(row["fetched_count"] for row in succeeded) == 6


def test_pass_results_persist_exact_scweet_run_identity(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_scweet_accounts_table(db_path)
    create_scweet_runs_table(db_path)
    insert_scweet_account(db_path, daily_requests=0, daily_tweets=0)
    clock = FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC))
    collector = collector_with_observability(
        db_path,
        RunRecordingScweet(db_path),
        clock,
    )

    collector.collect_daily_search(request(max_items=2))

    rows = account_usage_event_rows(db_path)
    succeeded = [
        row for row in rows if row["event_type"] == "pass_succeeded"
    ]
    state_deltas = [
        row
        for row in rows
        if row["event_type"] == "account_state_delta_observed"
    ]
    assert {row["collector_run_id"] for row in succeeded} == {
        "run-1",
        "run-2",
        "run-3",
    }
    assert {row["collector_run_id"] for row in state_deltas} == {
        "run-1",
        "run-2",
        "run-3",
    }
    assert all(
        row["collector_run_id"] is None
        for row in rows
        if row["event_type"] in {"budget_snapshot", "pass_started"}
    )


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
    state_deltas = [
        row for row in rows
        if row["event_type"] == "account_state_delta_observed"
    ]
    assert failed[0]["account_id"] is None
    assert failed[0]["failure_kind"] == "rate_limited"
    assert failed[0]["cooldown_reason"] is None
    assert failed[0]["reset_at"] == reset_at.isoformat()
    assert failed[0]["attribution_status"] == "unknown"
    assert cooldowns[0]["account_id"] == 1
    assert cooldowns[0]["cooldown_reason"] == "rate_limit"
    assert cooldowns[0]["requests_before"] is None
    assert cooldowns[0]["requests_after"] is None
    assert cooldowns[0]["tweets_before"] is None
    assert cooldowns[0]["tweets_after"] is None
    assert cooldowns[0]["observation_relation"] == (
        OVERLAPS_PASS_OBSERVATION_WINDOW
    )
    assert cooldowns[0]["attribution_status"] == "unknown"
    assert len(state_deltas) == 2
    assert state_deltas[-1]["failure_kind"] is None
    assert state_deltas[-1]["cooldown_reason"] is None
    assert state_deltas[-1]["pass_observation_id"] == failed[0][
        "pass_observation_id"
    ]
    assert all(row["fetched_count"] is None for row in state_deltas)
    assert all(row["accepted_count"] is None for row in state_deltas)
    assert sum(row["fetched_count"] or 0 for row in rows) == 2
    assert sum(row["event_type"] == "pass_succeeded" for row in rows) == 1
    assert sum(row["event_type"] == "pass_failed" for row in rows) == 1


def test_pass_result_is_unknown_when_two_account_states_change(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_scweet_accounts_table(db_path)
    insert_scweet_account(db_path, daily_requests=0, daily_tweets=0)
    insert_scweet_account(
        db_path,
        account_id=2,
        username="research-2",
        daily_requests=0,
        daily_tweets=0,
    )
    clock = FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC))
    collector = collector_with_observability(
        db_path,
        TwoAccountStateChangeScweet(db_path),
        clock,
    )

    collector.collect_daily_search(request(max_items=2))

    succeeded = [
        row for row in account_usage_event_rows(db_path)
        if row["event_type"] == "pass_succeeded"
    ]
    state_deltas = [
        row for row in account_usage_event_rows(db_path)
        if row["event_type"] == "account_state_delta_observed"
    ]
    assert {row["account_id"] for row in succeeded} == {None}
    assert {row["attribution_status"] for row in succeeded} == {"unknown"}
    assert sum(row["fetched_count"] for row in succeeded) == 6
    assert len(state_deltas) == 6
    assert {row["account_id"] for row in state_deltas} == {1, 2}
    assert sum(
        row["requests_after"] - row["requests_before"]
        for row in state_deltas
    ) == 6
    assert sum(
        row["tweets_after"] - row["tweets_before"]
        for row in state_deltas
    ) == 6
    assert all(row["fetched_count"] is None for row in state_deltas)
    assert all(row["accepted_count"] is None for row in state_deltas)
    assert all(
        sum(
            row["account_id"] == account_id
            and row["pass_observation_id"] == succeeded_row["pass_observation_id"]
            for row in state_deltas
        ) == 1
        for succeeded_row in succeeded
        for account_id in (1, 2)
    )


def test_pass_result_records_explicit_unknown_when_no_account_delta_exists(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_scweet_accounts_table(db_path)
    insert_scweet_account(db_path, daily_requests=0, daily_tweets=0)
    clock = FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC))
    collector = collector_with_observability(
        db_path,
        NoStateChangeScweet(),
        clock,
    )

    result = collector.collect_daily_search(request(max_items=1))

    assert [post.tweet_id for post in result.posts] == ["300"]
    succeeded = [
        row for row in account_usage_event_rows(db_path)
        if row["event_type"] == "pass_succeeded"
    ]
    assert len(succeeded) == 3
    assert {row["account_id"] for row in succeeded} == {None}
    assert {row["attribution_status"] for row in succeeded} == {"unknown"}
    assert not [
        row for row in account_usage_event_rows(db_path)
        if row["event_type"] == "account_state_delta_observed"
    ]


class DbUpdatingScweet:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self.calls: list[dict[str, object]] = []

    def search(self, query: str, **kwargs: object) -> list[dict[str, object]]:
        self.calls.append({"query": query, **kwargs})
        records = tweets_for_product(str(kwargs["display_type"]))
        increment_account_usage(self._db_path, request_count=1, tweet_count=len(records))

        return records


class RunRecordingScweet(DbUpdatingScweet):
    def search(self, query: str, **kwargs: object) -> list[dict[str, object]]:
        with sqlite3.connect(self._db_path) as connection:
            next_id = connection.execute(
                "SELECT count(*) + 1 FROM runs",
            ).fetchone()[0]
            connection.execute(
                "INSERT INTO runs (run_id) VALUES (?)",
                (f"run-{next_id}",),
            )
        return super().search(query, **kwargs)


class TwoAccountStateChangeScweet:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path

    def search(self, *_: object, **kwargs: object) -> list[dict[str, object]]:
        records = tweets_for_product(str(kwargs["display_type"]))
        increment_account_usage(
            self._db_path,
            request_count=1,
            tweet_count=len(records) - 1,
            account_id=1,
        )
        increment_account_usage(
            self._db_path,
            request_count=1,
            tweet_count=1,
            account_id=2,
        )

        return records


class NoStateChangeScweet:
    def search(self, *_: object, **kwargs: object) -> list[dict[str, object]]:
        return tweets_for_product(str(kwargs["display_type"]))


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
        pass_observation_id_factory=pass_observation_id_factory(),
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


def pass_observation_id_factory() -> Callable[[], str]:
    next_id = 0

    def create() -> str:
        nonlocal next_id
        next_id += 1
        return f"pass-observation-{next_id}"

    return create


def usage_event(index: int) -> AccountUsageEvent:
    return AccountUsageEvent(
        event_id=f"concurrent-event-{index}",
        event_type=AccountUsageEventType.PASS_STARTED,
        provider="x-twitter",
        occurred_at=datetime(2026, 6, 27, 12, tzinfo=UTC),
        account_id=None,
        username=None,
        request_id=f"request-{index}",
        scan_job_id=f"scan-{index}",
        source_binding_id="binding-1",
        query="AI agents",
        pass_observation_id=f"pass-observation-{index}",
    )


def append_events_concurrently(db_path: Path, worker_count: int = 8) -> int:
    start = Barrier(worker_count)

    def append_first_event(index: int) -> None:
        repository = SqliteAccountUsageEventRepository(str(db_path))
        start.wait(timeout=5)
        repository.append_events((usage_event(index),))

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = [
            executor.submit(append_first_event, index)
            for index in range(worker_count)
        ]
        for future in futures:
            future.result(timeout=10)

    return worker_count


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


def create_scweet_runs_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "CREATE TABLE runs (run_id TEXT NOT NULL PRIMARY KEY)",
        )


def insert_scweet_account(
    db_path: Path,
    *,
    account_id: int = 1,
    username: str = "research-1",
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
                account_id,
                username,
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
    account_id: int = 1,
) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            UPDATE accounts
            SET daily_requests = daily_requests + ?,
                daily_tweets = daily_tweets + ?,
                available_til = ?,
                cooldown_reason = ?
            WHERE id = ?
            """,
            (
                request_count,
                tweet_count,
                available_til,
                cooldown_reason,
                account_id,
            ),
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
