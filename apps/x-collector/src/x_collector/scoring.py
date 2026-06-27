from __future__ import annotations

import math
import re
from dataclasses import dataclass, replace
from datetime import datetime
from statistics import median

from .domain import SearchProduct, XCollectedPost, XPostMetrics


@dataclass(frozen=True)
class CandidateSignal:
    pass_label: str
    product: SearchProduct
    rank: int


@dataclass(frozen=True)
class RankedCandidate:
    post: XCollectedPost
    signals: tuple[CandidateSignal, ...]
    score: float


def rank_candidates(
    posts: list[tuple[XCollectedPost, CandidateSignal]],
    *,
    query: str,
    window_end: datetime,
    max_items: int,
) -> list[XCollectedPost]:
    candidates = aggregate_candidates(posts)
    if not candidates:
        return []

    engagements = [engagement_score(candidate.post.metrics) for candidate in candidates]
    velocities = [
        velocity_score(candidate.post, window_end)
        for candidate in candidates
    ]
    ranked = [
        rank_candidate(
            candidate,
            query=query,
            window_end=window_end,
            engagement_z=robust_z(engagements[index], engagements),
            velocity_z=robust_z(velocities[index], velocities),
        )
        for index, candidate in enumerate(candidates)
    ]
    ranked.sort(
        key=lambda item: (
            item.score,
            item.post.published_at,
            engagement_score(item.post.metrics),
        ),
        reverse=True,
    )

    return [
        replace(candidate.post, trend_score=candidate.score)
        for candidate in diversify_by_author(ranked, max_items)
    ]


def aggregate_candidates(
    posts: list[tuple[XCollectedPost, CandidateSignal]],
) -> list[RankedCandidate]:
    by_id: dict[str, tuple[XCollectedPost, list[CandidateSignal]]] = {}

    for post, signal in posts:
        current = by_id.get(post.tweet_id)
        if current is None:
            by_id[post.tweet_id] = (post, [signal])
            continue

        current_post, signals = current
        better_post = choose_better_post(current_post, post)
        by_id[post.tweet_id] = (better_post, [*signals, signal])

    return [
        RankedCandidate(post=post, signals=tuple(signals), score=0.0)
        for post, signals in by_id.values()
    ]


def choose_better_post(
    left: XCollectedPost,
    right: XCollectedPost,
) -> XCollectedPost:
    if engagement_score(right.metrics) > engagement_score(left.metrics):
        return right

    if left.source_product == SearchProduct.LATEST and right.source_product == SearchProduct.TOP:
        return right

    return left


def rank_candidate(
    candidate: RankedCandidate,
    *,
    query: str,
    window_end: datetime,
    engagement_z: float,
    velocity_z: float,
) -> RankedCandidate:
    score = (
        50.0
        + 16.0 * clamp(engagement_z, -2.5, 2.5)
        + 12.0 * clamp(velocity_z, -2.5, 2.5)
        + 16.0 * source_confidence(candidate.signals)
        + 10.0 * relevance_score(candidate.post, query)
        - penalties(candidate.post, window_end)
    )

    return replace(candidate, score=round(max(score, 0.0), 4))


def engagement_score(metrics: XPostMetrics) -> float:
    return (
        math.log1p(metrics.likes)
        + 1.8 * math.log1p(metrics.retweets)
        + 1.1 * math.log1p(metrics.replies)
    )


def velocity_score(post: XCollectedPost, window_end: datetime) -> float:
    age_hours = max(
        (window_end - post.published_at).total_seconds() / 3600,
        0.25,
    )
    return engagement_score(post.metrics) / math.pow(age_hours + 2.0, 0.35)


def source_confidence(signals: tuple[CandidateSignal, ...]) -> float:
    products = {signal.product for signal in signals}
    labels = {signal.pass_label for signal in signals}
    best_rank = min(signal.rank for signal in signals)
    rank_bonus = min(0.2, 1.0 / math.log2(best_rank + 2) / 5)

    if SearchProduct.TOP in products and SearchProduct.LATEST in products:
        base = 1.0
    elif SearchProduct.TOP in products:
        base = 0.82
    else:
        base = 0.62

    if "top_strict" in labels:
        base += 0.08

    return min(base + rank_bonus, 1.2)


def relevance_score(post: XCollectedPost, query: str) -> float:
    text = normalize_text(f"{post.text} {post.author_handle or ''}")
    phrase = normalize_text(query)
    if phrase and phrase in text:
        return 1.0

    query_tokens = meaningful_tokens(query)
    if not query_tokens:
        return 0.5

    text_tokens = set(meaningful_tokens(post.text))
    overlap = len(query_tokens & text_tokens) / len(query_tokens)

    return clamp(overlap, 0.0, 1.0)


def penalties(post: XCollectedPost, window_end: datetime) -> float:
    penalty = 0.0
    age_hours = (window_end - post.published_at).total_seconds() / 3600

    if age_hours < -0.1:
        penalty += 25.0
    if age_hours > 72:
        penalty += 12.0
    if post.text.strip().startswith("RT @"):
        penalty += 8.0
    if len(post.text.strip()) < 12:
        penalty += 5.0
    if post.metrics.likes == 0 and post.metrics.retweets == 0:
        penalty += 4.0

    return penalty


def diversify_by_author(
    ranked: list[RankedCandidate],
    max_items: int,
) -> list[RankedCandidate]:
    if max_items <= 0:
        return []

    per_author_limit = max(1, min(3, math.ceil(max_items / 4)))
    counts: dict[str, int] = {}
    selected: list[RankedCandidate] = []
    deferred: list[RankedCandidate] = []

    for candidate in ranked:
        author = (candidate.post.author_handle or "").lower()
        if not author:
            selected.append(candidate)
        elif counts.get(author, 0) < per_author_limit:
            counts[author] = counts.get(author, 0) + 1
            selected.append(candidate)
        else:
            deferred.append(candidate)

        if len(selected) >= max_items:
            return selected

    for candidate in deferred:
        if len(selected) >= max_items:
            break
        selected.append(candidate)

    return selected


def robust_z(value: float, values: list[float]) -> float:
    if not values:
        return 0.0

    center = median(values)
    deviations = [abs(item - center) for item in values]
    mad = median(deviations)
    if mad == 0:
        return 0.0

    return 0.6745 * (value - center) / mad


def meaningful_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9_#]{3,}", normalize_text(value))
        if token not in {"the", "and", "for", "with", "from", "this", "that"}
    }


def normalize_text(value: str) -> str:
    return " ".join(value.casefold().split())


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)

