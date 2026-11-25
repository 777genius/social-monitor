from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from x_collector.account_pool import (
    AccountCapacity,
    AccountPoolLimits,
    AccountPoolSnapshot,
)
from x_collector.domain import DailySearchRequest, SearchProduct
from x_collector.scweet_adapter import (
    ScweetDailySearchCollector,
    XCollectorRateLimitError,
)


NOW = datetime(2026, 7, 11, 12, tzinfo=UTC)


@dataclass(frozen=True)
class FixedClock:
    def now(self) -> datetime:
        return NOW


class StaticAccountLedger:
    def __init__(self, accounts: tuple[AccountCapacity, ...]) -> None:
        self._snapshot = AccountPoolSnapshot(
            observed_at=NOW,
            limits=AccountPoolLimits(daily_requests=30, daily_tweets=600),
            accounts=accounts,
        )

    def snapshot(self, now: datetime) -> AccountPoolSnapshot:
        del now
        return self._snapshot

    def apply_profile_cooldowns(self, now: datetime) -> None:
        del now

    def apply_collection_priorities(self, now: datetime) -> None:
        del now


class RateLimitedScweet:
    def search(self, *_: object, **__: object) -> list[dict[str, object]]:
        raise RuntimeError("rate limit reset=1783772100")


class SuccessfulScweet:
    def search(self, *_: object, **__: object) -> list[dict[str, object]]:
        return [tweet("success")]


def test_rate_limited_pass_fails_over_to_remaining_account() -> None:
    instances = [RateLimitedScweet(), SuccessfulScweet()]
    created: list[object] = []

    def factory() -> object:
        instance = instances[min(len(created), len(instances) - 1)]
        created.append(instance)
        return instance

    collector = ScweetDailySearchCollector(
        factory,
        FixedClock(),
        account_pool_ledger=StaticAccountLedger((account(1), account(2))),
        scweet_api_page_size=20,
        scweet_n_splits=1,
    )

    result = collector.collect_daily_search(request())

    assert [post.tweet_id for post in result.posts] == ["success"]
    assert len(created) == 2
    assert any(
        warning.code == "x_collector.account_failover"
        for warning in result.warnings
    )


def test_rate_limit_is_not_retried_without_remaining_capacity() -> None:
    created: list[object] = []

    def factory() -> object:
        instance = RateLimitedScweet()
        created.append(instance)
        return instance

    collector = ScweetDailySearchCollector(
        factory,
        FixedClock(),
        account_pool_ledger=StaticAccountLedger((account(1, requests=30),)),
        scweet_api_page_size=20,
        scweet_n_splits=1,
    )

    with pytest.raises(XCollectorRateLimitError):
        collector.collect_daily_search(request())

    assert len(created) == 1


def account(
    account_id: int,
    *,
    requests: int = 0,
) -> AccountCapacity:
    return AccountCapacity(
        account_id=account_id,
        username=f"account-{account_id}",
        status=1,
        daily_requests=requests,
        daily_tweets=0,
        daily_requests_limit=30,
        daily_tweets_limit=600,
        priority=100,
        remaining_requests=max(30 - requests, 0),
        remaining_tweets=600,
        available_at=None,
        lease_id=None,
        lease_expires_at=None,
        busy=False,
        cooldown_reason=None,
    )


def request() -> DailySearchRequest:
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
        window_end=NOW,
        search_products=(SearchProduct.TOP,),
        limit_per_product=1,
        max_items=1,
        min_likes=0,
        min_retweets=0,
        min_replies=0,
        cursor=None,
    )


def tweet(tweet_id: str) -> dict[str, object]:
    return {
        "tweet_id": tweet_id,
        "timestamp": "Sat Jul 11 11:30:00 +0000 2026",
        "user": {"screen_name": "builder", "name": "Builder"},
        "text": "Concrete AI agent release",
        "likes": 10,
        "retweets": 1,
        "comments": 1,
        "tweet_url": f"https://x.com/builder/status/{tweet_id}",
    }
