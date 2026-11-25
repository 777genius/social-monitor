from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from x_collector import scoring
from x_collector.domain import SearchProduct, XCollectedPost, XPostMetrics
from x_collector.scoring import (
    CandidateSignal,
    RankedCandidate,
    absolute_engagement_contribution,
    age_adjusted_engagement_contribution,
    age_adjusted_engagement_score,
    rank_candidate,
)


WINDOW_END = datetime(2026, 7, 12, 0, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("standardized_value", "expected"),
    [
        (-100.0, -10.0),
        (-2.5, -10.0),
        (0.0, 0.0),
        (1.25, 5.0),
        (2.5, 10.0),
        (100.0, 10.0),
    ],
)
def test_absolute_engagement_contribution_has_exact_ten_point_cap(
    standardized_value: float,
    expected: float,
) -> None:
    assert absolute_engagement_contribution(standardized_value) == expected


@pytest.mark.parametrize(
    ("standardized_value", "expected"),
    [
        (-100.0, -5.0),
        (-2.5, -5.0),
        (0.0, 0.0),
        (1.25, 2.5),
        (2.5, 5.0),
        (100.0, 5.0),
    ],
)
def test_age_adjusted_engagement_contribution_has_exact_five_point_cap(
    standardized_value: float,
    expected: float,
) -> None:
    assert age_adjusted_engagement_contribution(standardized_value) == expected


def test_age_adjusted_engagement_is_single_snapshot_age_normalization() -> None:
    recent = post(published_at=WINDOW_END - timedelta(hours=1))
    older = post(published_at=WINDOW_END - timedelta(hours=24))

    assert age_adjusted_engagement_score(recent, WINDOW_END) > (
        age_adjusted_engagement_score(older, WINDOW_END)
    )
    assert not hasattr(scoring, "velocity_score")


def test_rank_candidate_caps_combined_live_engagement_at_fifteen_points() -> None:
    candidate = ranked_candidate(post())
    neutral = rank_candidate(
        candidate,
        query="unmatched query",
        window_end=WINDOW_END,
        engagement_z=0.0,
        age_adjusted_engagement_z=0.0,
    )
    strongest = rank_candidate(
        candidate,
        query="unmatched query",
        window_end=WINDOW_END,
        engagement_z=100.0,
        age_adjusted_engagement_z=100.0,
    )
    weakest = rank_candidate(
        candidate,
        query="unmatched query",
        window_end=WINDOW_END,
        engagement_z=-100.0,
        age_adjusted_engagement_z=-100.0,
    )

    assert strongest.score - neutral.score == pytest.approx(15.0)
    assert neutral.score - weakest.score == pytest.approx(15.0)


def test_exact_query_relevance_survives_opposite_engagement_extremes() -> None:
    relevant = ranked_candidate(
        post(text="Agent observability release with concrete benchmark details"),
    )
    unrelated = ranked_candidate(
        post(tweet_id="unrelated", text="Weekend photo collection update"),
    )

    relevant_ranked = rank_candidate(
        relevant,
        query="agent observability",
        window_end=WINDOW_END,
        engagement_z=-100.0,
        age_adjusted_engagement_z=-100.0,
    )
    unrelated_ranked = rank_candidate(
        unrelated,
        query="agent observability",
        window_end=WINDOW_END,
        engagement_z=100.0,
        age_adjusted_engagement_z=100.0,
    )

    assert relevant_ranked.score > unrelated_ranked.score


def ranked_candidate(candidate_post: XCollectedPost) -> RankedCandidate:
    return RankedCandidate(
        post=candidate_post,
        signals=(
            CandidateSignal(
                pass_label="top",
                product=SearchProduct.TOP,
                rank=1,
            ),
        ),
        score=0.0,
    )


def post(
    *,
    tweet_id: str = "post-1",
    text: str = "General collector result with enough body text",
    published_at: datetime = WINDOW_END - timedelta(hours=1),
) -> XCollectedPost:
    return XCollectedPost(
        tweet_id=tweet_id,
        canonical_url=f"https://x.com/example/status/{tweet_id}",
        text=text,
        author_handle="example",
        author_name="Example",
        published_at=published_at,
        metrics=XPostMetrics(likes=100, retweets=20, replies=10),
        media_urls=(),
        source_product=SearchProduct.TOP,
        trend_score=0.0,
    )
