from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class SearchProduct(str, Enum):
    TOP = "top"
    LATEST = "latest"


class XPostContentKind(str, Enum):
    ORIGINAL = "original_post"
    REPLY = "reply"
    QUOTE = "quote"
    UNKNOWN = "unknown"


class XEligibilityMetricsState(str, Enum):
    OBSERVED = "observed"
    MISSING = "missing"
    MALFORMED = "malformed"
    CONFLICT = "conflict"


@dataclass(frozen=True)
class DailySearchRequest:
    request_id: str
    tenant_id: str
    workspace_id: str
    source_binding_id: str
    scan_job_id: str
    correlation_id: str
    query: str
    language: str | None
    window_hours: int
    window_end: datetime
    search_products: tuple[SearchProduct, ...]
    limit_per_product: int
    max_items: int
    min_likes: int | None
    min_retweets: int | None
    min_replies: int | None
    cursor: str | None


@dataclass(frozen=True)
class XPostMetrics:
    likes: int
    retweets: int
    replies: int
    quotes: int | None = None
    views: int | None = None
    likes_observed: bool = True
    retweets_observed: bool = True
    eligibility_state: XEligibilityMetricsState = XEligibilityMetricsState.OBSERVED


@dataclass(frozen=True)
class XCollectedPost:
    tweet_id: str
    canonical_url: str
    text: str
    author_handle: str | None
    author_name: str | None
    published_at: datetime
    metrics: XPostMetrics
    media_urls: tuple[str, ...]
    source_product: SearchProduct
    trend_score: float
    content_kind: XPostContentKind = XPostContentKind.UNKNOWN


@dataclass(frozen=True)
class XCollectorWarning:
    code: str
    message: str


@dataclass(frozen=True)
class XCollectorRun:
    collector_engine: str
    collector_version: str
    started_at: datetime
    completed_at: datetime
    requested_limit: int
    fetched_count: int
    returned_count: int
    partial: bool


@dataclass(frozen=True)
class DailySearchResult:
    posts: tuple[XCollectedPost, ...]
    next_cursor: str | None
    warnings: tuple[XCollectorWarning, ...]
    run: XCollectorRun


class XCollectorError(Exception):
    """Base class for collector errors mapped to gRPC status codes."""


class XCollectorInvalidRequestError(XCollectorError):
    pass


class XCollectorAuthError(XCollectorError):
    pass


class XCollectorRateLimitError(XCollectorError):
    def __init__(
        self,
        message: str,
        *,
        retry_after_ms: int | None = None,
        reset_at: datetime | None = None,
    ) -> None:
        super().__init__(message)
        self.retry_after_ms = retry_after_ms
        self.reset_at = reset_at


class XCollectorUnavailableError(XCollectorError):
    pass
