from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from x_collector.domain import DailySearchRequest, SearchProduct
from x_collector.scweet_adapter import (
    ScweetDailySearchCollector,
    XCollectorRateLimitError,
    post_from_scweet_record,
    scweet_date_window,
)


@dataclass(frozen=True)
class FixedClock:
    value: datetime

    def now(self) -> datetime:
        return self.value


class FakeScweet:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def search(self, query: str, **kwargs: object) -> list[dict[str, object]]:
        self.calls.append({"query": query, **kwargs})
        product = kwargs["display_type"]

        if product == "Top":
            return [
                tweet("100", likes=10, retweets=1, comments=1),
                tweet("200", likes=20, retweets=2, comments=0),
            ]

        return [
            tweet("100", likes=1, retweets=0, comments=0),
            tweet("300", likes=5, retweets=20, comments=0),
        ]


def test_collect_daily_search_sorts_and_deduplicates_by_trend_score() -> None:
    fake = FakeScweet()
    collector = ScweetDailySearchCollector(
        lambda: fake,
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
    )

    result = collector.collect_daily_search(
        request(
            search_products=(SearchProduct.TOP, SearchProduct.LATEST),
            max_items=2,
        ),
    )

    assert [post.tweet_id for post in result.posts] == ["300", "200"]
    assert result.posts[0].source_product == SearchProduct.LATEST
    assert result.posts[0].media_urls == ("https://cdn.example/300.jpg",)
    assert result.run.fetched_count == 6
    assert result.run.returned_count == 2
    assert len(fake.calls) == 3
    assert fake.calls[0] == {
        "query": "AI agents",
        "since": "2026-06-26",
        "until": "2026-06-28",
        "lang": "en",
        "display_type": "Top",
        "limit": 10,
        "min_likes": 5,
        "min_retweets": None,
        "min_replies": None,
        "save": False,
        "resume": False,
    }
    assert fake.calls[1] == {
        "query": "AI agents",
        "since": "2026-06-26",
        "until": "2026-06-28",
        "lang": "en",
        "display_type": "Top",
        "limit": 10,
        "min_likes": 50,
        "min_retweets": 10,
        "min_replies": 5,
        "save": False,
        "resume": False,
    }
    assert fake.calls[2] == {
        "query": "AI agents",
        "since": "2026-06-26",
        "until": "2026-06-28",
        "lang": "en",
        "display_type": "Latest",
        "limit": 10,
        "min_likes": 5,
        "min_retweets": None,
        "min_replies": None,
        "save": False,
        "resume": False,
    }


def test_collect_daily_search_ignores_external_cursor_for_daily_snapshot() -> None:
    fake = FakeScweet()
    collector = ScweetDailySearchCollector(
        lambda: fake,
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
    )

    result = collector.collect_daily_search(request(cursor="old-cursor"))

    assert all(call["resume"] is False for call in fake.calls)
    assert result.warnings[0].code == "x_collector.cursor_ignored"


def test_collect_daily_search_filters_posts_outside_requested_window() -> None:
    fake = StaticScweet([
        {
            **tweet("old", likes=100, retweets=100, comments=100),
            "timestamp": "Thu Jun 25 11:30:00 +0000 2026",
        },
        tweet("fresh", likes=10, retweets=1, comments=1),
    ])
    collector = ScweetDailySearchCollector(
        lambda: fake,
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
    )

    result = collector.collect_daily_search(request(search_products=(SearchProduct.LATEST,)))

    assert [post.tweet_id for post in result.posts] == ["fresh"]


def test_collect_daily_search_runs_top_and_latest_even_when_top_requested() -> None:
    fake = FakeScweet()
    collector = ScweetDailySearchCollector(
        lambda: fake,
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
    )

    collector.collect_daily_search(request(search_products=(SearchProduct.TOP,)))

    assert [call["display_type"] for call in fake.calls] == [
        "Top",
        "Top",
        "Latest",
    ]


def test_collect_daily_search_uses_lower_threshold_for_latest_discovery() -> None:
    fake = FakeScweet()
    collector = ScweetDailySearchCollector(
        lambda: fake,
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
    )

    collector.collect_daily_search(request(min_likes=90))

    assert fake.calls[-1]["display_type"] == "Latest"
    assert fake.calls[-1]["min_likes"] == 30


def test_collect_daily_search_handles_non_list_scweet_response() -> None:
    fake = StaticScweet({"unexpected": True})
    collector = ScweetDailySearchCollector(
        lambda: fake,
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
    )

    result = collector.collect_daily_search(request())

    assert result.posts == ()
    assert result.run.fetched_count == 0


def test_scweet_date_window_uses_explicit_dates() -> None:
    assert scweet_date_window(request()) == ("2026-06-26", "2026-06-28")


def test_post_mapping_drops_invalid_records() -> None:
    assert post_from_scweet_record({}, SearchProduct.TOP) is None


def test_rate_limit_errors_are_mapped() -> None:
    collector = ScweetDailySearchCollector(
        lambda: BrokenScweet("daily cap reached"),
        FixedClock(datetime(2026, 6, 27, 12, tzinfo=UTC)),
    )

    with pytest.raises(XCollectorRateLimitError):
        collector.collect_daily_search(request())


class BrokenScweet:
    def __init__(self, message: str) -> None:
        self._message = message

    def search(self, *_: object, **__: object) -> list[dict[str, object]]:
        raise RuntimeError(self._message)


def request(
    *,
    search_products: tuple[SearchProduct, ...] = (SearchProduct.TOP,),
    max_items: int = 5,
    min_likes: int | None = 5,
    cursor: str | None = None,
) -> DailySearchRequest:
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
        search_products=search_products,
        limit_per_product=10,
        max_items=max_items,
        min_likes=min_likes,
        min_retweets=None,
        min_replies=None,
        cursor=cursor,
    )


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


class StaticScweet:
    def __init__(self, response: object) -> None:
        self.response = response

    def search(self, *_: object, **__: object) -> object:
        return self.response
