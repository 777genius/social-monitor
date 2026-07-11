from __future__ import annotations

import sqlite3
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from x_collector.candidate_rejection_cache import (
    CandidateRejection,
    CandidateRejectionCacheError,
    CandidateRejectionPolicy,
    CandidateRejectionScope,
    candidate_rejection_scope,
)
from x_collector.domain import (
    DailySearchRequest,
    SearchProduct,
    XCollectedPost,
    XPostMetrics,
)
from x_collector.scweet_adapter import ScweetDailySearchCollector
from x_collector.sqlite_candidate_rejection_repository import (
    SqliteCandidateRejectionRepository,
)


NOW = datetime(2026, 7, 11, 3, tzinfo=UTC)


@dataclass(frozen=True)
class FixedClock:
    value: datetime

    def now(self) -> datetime:
        return self.value


class StaticScweet:
    def __init__(self, records: list[dict[str, object]]) -> None:
        self.records = records

    def search(self, *_: object, **__: object) -> list[dict[str, object]]:
        return self.records


class FailingWriteRepository(SqliteCandidateRejectionRepository):
    def record_outcomes(
        self,
        scope: CandidateRejectionScope,
        selected_tweet_ids: tuple[str, ...],
        rejections: tuple[CandidateRejection, ...],
        now: datetime,
    ) -> None:
        raise CandidateRejectionCacheError("database is read-only")


def test_policy_suppresses_only_before_refresh_ttl() -> None:
    policy = CandidateRejectionPolicy(refresh_ttl=timedelta(hours=6))
    candidate = post("candidate", likes=4)
    rejection = policy.new_rejection(candidate, NOW)

    assert policy.should_suppress(rejection, candidate, request(), NOW)
    assert not policy.should_suppress(
        rejection,
        candidate,
        request(),
        NOW + timedelta(hours=6),
    )
    retention_policy = CandidateRejectionPolicy(
        refresh_ttl=timedelta(days=2),
        retention_ttl=timedelta(days=1),
    )
    retained_rejection = retention_policy.new_rejection(candidate, NOW)
    assert not retention_policy.should_suppress(
        retained_rejection,
        candidate,
        request(),
        NOW + timedelta(days=1),
    )
    daily_rejection = CandidateRejectionPolicy().new_rejection(candidate, NOW)
    assert CandidateRejectionPolicy().should_suppress(
        daily_rejection,
        candidate,
        request(),
        NOW + timedelta(hours=24),
    )


def test_policy_readmits_changed_content_metrics_threshold_and_version() -> None:
    original = post("candidate", likes=4)
    policy = CandidateRejectionPolicy(minimum_weighted_growth=5)
    rejection = policy.new_rejection(original, NOW)

    assert not policy.should_suppress(
        rejection,
        replace(original, text="materially changed post"),
        request(),
        NOW,
    )
    assert not policy.should_suppress(
        rejection,
        replace(original, metrics=XPostMetrics(likes=10, retweets=0, replies=0)),
        request(),
        NOW,
    )
    assert not policy.should_suppress(
        rejection,
        replace(original, metrics=XPostMetrics(likes=5, retweets=0, replies=0)),
        request(min_likes=5),
        NOW,
    )
    assert not CandidateRejectionPolicy(
        policy_version="x-rank-rejection-v2",
    ).should_suppress(rejection, original, request(), NOW)


def test_sqlite_repository_isolates_tenant_workspace_binding_and_query_scope(
    tmp_path: Path,
) -> None:
    repository = SqliteCandidateRejectionRepository(str(tmp_path / "state.db"))
    scope = candidate_rejection_scope(request())
    rejection = CandidateRejectionPolicy().new_rejection(post("candidate"), NOW)
    repository.record_rejections(scope, (rejection,), NOW)

    assert repository.load_rejections(scope, ("candidate",))["candidate"] == rejection
    for isolated_scope in (
        replace(scope, tenant_id="other-tenant"),
        replace(scope, workspace_id="other-workspace"),
        replace(scope, source_binding_id="other-binding"),
        replace(scope, query_scope_hash="other-query"),
    ):
        assert repository.load_rejections(isolated_scope, ("candidate",)) == {}

    assert candidate_rejection_scope(request(max_items=1)) != scope
    assert candidate_rejection_scope(
        replace(request(), window_end=NOW + timedelta(hours=1)),
    ) == scope


def test_collector_suppresses_prior_rank_rejection_and_fills_with_novel_post(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "state.db"
    repository = SqliteCandidateRejectionRepository(str(db_path))
    first_scweet = StaticScweet([
        record("selected", likes=100),
        record("rank-rejected", likes=10),
    ])
    first = collector(first_scweet, repository)

    first_result = first.collect_daily_search(request(max_items=1))

    assert [item.tweet_id for item in first_result.posts] == ["selected"]
    second_scweet = StaticScweet([
        record("rank-rejected", likes=10),
        record("novel", likes=5),
    ])
    second_result = collector(second_scweet, repository).collect_daily_search(
        request(max_items=1),
    )

    assert [item.tweet_id for item in second_result.posts] == ["novel"]
    scope = candidate_rejection_scope(request(max_items=1))
    persisted = repository.load_rejections(
        scope,
        ("selected", "rank-rejected", "novel"),
    )
    assert set(persisted) == {"rank-rejected"}
    assert persisted["rank-rejected"].seen_count == 2
    assert_sqlite_cache_contains_no_raw_content(db_path)


def test_collector_readmits_cached_rejection_instead_of_returning_underfilled(
    tmp_path: Path,
) -> None:
    repository = SqliteCandidateRejectionRepository(str(tmp_path / "state.db"))
    collector(
        StaticScweet([
            record("selected", likes=100),
            record("rank-rejected", likes=10),
        ]),
        repository,
    ).collect_daily_search(request(max_items=1))

    result = collector(
        StaticScweet([record("rank-rejected", likes=10)]),
        repository,
    ).collect_daily_search(request(max_items=1))

    assert [item.tweet_id for item in result.posts] == ["rank-rejected"]
    assert repository.load_rejections(
        candidate_rejection_scope(request(max_items=1)),
        ("rank-rejected",),
    ) == {}


def test_collector_fails_open_when_cache_read_or_write_fails(tmp_path: Path) -> None:
    records = [record("strong", likes=100), record("weak", likes=1)]
    for repository in (
        SqliteCandidateRejectionRepository(str(tmp_path)),
        FailingWriteRepository(str(tmp_path / "write.db")),
    ):
        result = collector(StaticScweet(records), repository).collect_daily_search(
            request(max_items=1),
        )

        assert [item.tweet_id for item in result.posts] == ["strong"]
        assert any(
            warning.code == "x_collector.rejection_cache_unavailable"
            for warning in result.warnings
        )


def test_sqlite_repository_translates_driver_errors(tmp_path: Path) -> None:
    repository = SqliteCandidateRejectionRepository(str(tmp_path))

    with pytest.raises(CandidateRejectionCacheError):
        repository.load_rejections(
            candidate_rejection_scope(request()),
            ("candidate",),
        )


def test_sqlite_repository_fails_open_for_corrupt_cached_record(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "state.db"
    repository = SqliteCandidateRejectionRepository(str(db_path))
    scope = candidate_rejection_scope(request())
    rejection = CandidateRejectionPolicy().new_rejection(post("candidate"), NOW)
    repository.record_rejections(scope, (rejection,), NOW)
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "UPDATE x_candidate_rejections SET refresh_after = 'not-a-date'",
        )

    with pytest.raises(CandidateRejectionCacheError):
        repository.load_rejections(scope, ("candidate",))


def test_sqlite_repository_records_selected_and_rejected_atomically(
    tmp_path: Path,
) -> None:
    repository = SqliteCandidateRejectionRepository(str(tmp_path / "state.db"))
    scope = candidate_rejection_scope(request())
    policy = CandidateRejectionPolicy()
    repository.record_rejections(
        scope,
        (policy.new_rejection(post("selected"), NOW),),
        NOW,
    )

    repository.record_outcomes(
        scope,
        ("selected",),
        (policy.new_rejection(post("rejected"), NOW),),
        NOW,
    )

    assert set(
        repository.load_rejections(scope, ("selected", "rejected")),
    ) == {"rejected"}


def collector(
    scweet: StaticScweet,
    repository: SqliteCandidateRejectionRepository,
) -> ScweetDailySearchCollector:
    return ScweetDailySearchCollector(
        lambda: scweet,
        FixedClock(NOW),
        candidate_rejection_repository=repository,
    )


def request(
    *,
    max_items: int = 5,
    min_likes: int | None = 5,
) -> DailySearchRequest:
    return DailySearchRequest(
        request_id="request-1",
        tenant_id="tenant-1",
        workspace_id="workspace-1",
        source_binding_id="binding-1",
        scan_job_id="scan-1",
        correlation_id="correlation-1",
        query="AI agents",
        language="en",
        window_hours=24,
        window_end=datetime(2026, 7, 11, 0, tzinfo=UTC),
        search_products=(SearchProduct.TOP,),
        limit_per_product=10,
        max_items=max_items,
        min_likes=min_likes,
        min_retweets=None,
        min_replies=None,
        cursor=None,
    )


def post(
    tweet_id: str,
    *,
    likes: int = 1,
) -> XCollectedPost:
    return XCollectedPost(
        tweet_id=tweet_id,
        canonical_url=f"https://x.com/builder/status/{tweet_id}",
        text=f"Post {tweet_id}",
        author_handle="builder",
        author_name="Builder",
        published_at=datetime(2026, 7, 10, 23, tzinfo=UTC),
        metrics=XPostMetrics(likes=likes, retweets=0, replies=0),
        media_urls=(),
        source_product=SearchProduct.TOP,
        trend_score=float(likes),
    )


def record(tweet_id: str, *, likes: int) -> dict[str, object]:
    return {
        "tweet_id": tweet_id,
        "timestamp": "Fri Jul 10 23:00:00 +0000 2026",
        "user": {"screen_name": "builder", "name": "Builder"},
        "text": f"Post {tweet_id}",
        "likes": likes,
        "retweets": 0,
        "comments": 0,
        "tweet_url": f"https://x.com/builder/status/{tweet_id}",
    }


def assert_sqlite_cache_contains_no_raw_content(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(x_candidate_rejections)")
        }

    assert "text" not in columns
    assert "raw_payload" not in columns
    assert "query" not in columns
    assert "content_fingerprint" in columns
    assert "query_scope_hash" in columns
