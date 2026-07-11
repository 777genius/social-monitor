from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from .domain import DailySearchRequest, XCollectedPost, XPostMetrics


RANK_REJECTED_REASON = "rank_rejected"
DEFAULT_REJECTION_POLICY_VERSION = "x-rank-rejection-v1"


class CandidateRejectionCacheError(Exception):
    """Derived cache failure that callers must handle by collecting normally."""


@dataclass(frozen=True)
class CandidateRejectionScope:
    tenant_id: str
    workspace_id: str
    source_binding_id: str
    query_scope_hash: str


@dataclass(frozen=True)
class MetricWatermark:
    likes: int
    retweets: int
    replies: int
    quotes: int | None
    views: int | None


@dataclass(frozen=True)
class CandidateSnapshot:
    tweet_id: str
    content_fingerprint: str
    metrics: MetricWatermark


@dataclass(frozen=True)
class CandidateRejection:
    snapshot: CandidateSnapshot
    reason: str
    policy_version: str
    refresh_after: datetime
    expires_at: datetime
    seen_count: int


@dataclass(frozen=True)
class CandidateRejectionPolicy:
    policy_version: str = DEFAULT_REJECTION_POLICY_VERSION
    refresh_ttl: timedelta = timedelta(hours=30)
    retention_ttl: timedelta = timedelta(days=30)
    minimum_weighted_growth: int = 5
    relative_growth_ratio: float = 0.25

    def new_rejection(
        self,
        post: XCollectedPost,
        now: datetime,
    ) -> CandidateRejection:
        return CandidateRejection(
            snapshot=snapshot_candidate(post),
            reason=RANK_REJECTED_REASON,
            policy_version=self.policy_version,
            refresh_after=now + self.refresh_ttl,
            expires_at=now + self.retention_ttl,
            seen_count=1,
        )

    def should_suppress(
        self,
        rejection: CandidateRejection,
        post: XCollectedPost,
        request: DailySearchRequest,
        now: datetime,
    ) -> bool:
        current = snapshot_candidate(post)
        if rejection.reason != RANK_REJECTED_REASON:
            return False
        if rejection.policy_version != self.policy_version:
            return False
        if now >= rejection.refresh_after or now >= rejection.expires_at:
            return False
        if current.content_fingerprint != rejection.snapshot.content_fingerprint:
            return False
        if metrics_cross_request_threshold(
            rejection.snapshot.metrics,
            current.metrics,
            request,
        ):
            return False
        if self._has_meaningful_metric_growth(
            rejection.snapshot.metrics,
            current.metrics,
        ):
            return False
        return True

    def _has_meaningful_metric_growth(
        self,
        previous: MetricWatermark,
        current: MetricWatermark,
    ) -> bool:
        previous_weighted = weighted_engagement(previous)
        current_weighted = weighted_engagement(current)
        required_growth = max(
            self.minimum_weighted_growth,
            math.ceil(previous_weighted * self.relative_growth_ratio),
        )
        if current_weighted - previous_weighted >= required_growth:
            return True

        return optional_metric_grew_meaningfully(previous.views, current.views)


def candidate_rejection_scope(
    request: DailySearchRequest,
) -> CandidateRejectionScope:
    query_policy_scope = {
        "language": request.language,
        "limitPerProduct": request.limit_per_product,
        "maxItems": request.max_items,
        "minLikes": request.min_likes,
        "minReplies": request.min_replies,
        "minRetweets": request.min_retweets,
        "query": " ".join(request.query.casefold().split()),
        "searchProducts": sorted(product.value for product in request.search_products),
        "windowHours": request.window_hours,
    }
    encoded = json.dumps(
        query_policy_scope,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return CandidateRejectionScope(
        tenant_id=request.tenant_id,
        workspace_id=request.workspace_id,
        source_binding_id=request.source_binding_id,
        query_scope_hash=hashlib.sha256(encoded).hexdigest(),
    )


def snapshot_candidate(post: XCollectedPost) -> CandidateSnapshot:
    content = {
        "authorHandle": normalized_text(post.author_handle),
        "canonicalUrl": post.canonical_url.strip(),
        "mediaUrls": sorted(url.strip() for url in post.media_urls),
        "publishedAt": post.published_at.isoformat(),
        "sourceProduct": post.source_product.value,
        "text": normalized_text(post.text),
    }
    encoded = json.dumps(
        content,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return CandidateSnapshot(
        tweet_id=post.tweet_id,
        content_fingerprint=hashlib.sha256(encoded).hexdigest(),
        metrics=metric_watermark(post.metrics),
    )


def metric_watermark(metrics: XPostMetrics) -> MetricWatermark:
    return MetricWatermark(
        likes=metrics.likes,
        retweets=metrics.retweets,
        replies=metrics.replies,
        quotes=metrics.quotes,
        views=metrics.views,
    )


def metrics_cross_request_threshold(
    previous: MetricWatermark,
    current: MetricWatermark,
    request: DailySearchRequest,
) -> bool:
    return any(
        threshold is not None
        and previous_value < threshold <= current_value
        for previous_value, current_value, threshold in (
            (previous.likes, current.likes, request.min_likes),
            (previous.retweets, current.retweets, request.min_retweets),
            (previous.replies, current.replies, request.min_replies),
        )
    )


def weighted_engagement(metrics: MetricWatermark) -> int:
    return metrics.likes + 2 * metrics.retweets + metrics.replies


def optional_metric_grew_meaningfully(
    previous: int | None,
    current: int | None,
) -> bool:
    if previous is None or current is None:
        return False
    return current - previous >= max(100, math.ceil(previous * 0.25))


def normalized_text(value: str | None) -> str | None:
    if value is None:
        return None
    return " ".join(value.casefold().split())
