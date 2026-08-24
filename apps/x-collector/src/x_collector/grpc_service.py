from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import grpc
from google.protobuf.timestamp_pb2 import Timestamp

from x_collector.v1 import x_collector_pb2, x_collector_pb2_grpc

from .domain import (
    DailySearchRequest,
    DailySearchResult,
    SearchProduct,
    XCollectedPost,
    XCollectorAuthError,
    XCollectorError,
    XCollectorInvalidRequestError,
    XCollectorRateLimitError,
    XCollectorRun,
    XCollectorUnavailableError,
    XCollectorWarning,
    XPostMetrics,
    XPostContentKind,
    XEligibilityMetricsState,
)
from .health import XCollectorHealthMonitor
from .ports import DailySearchCollectorPort


class XCollectorGrpcService(x_collector_pb2_grpc.XCollectorServiceServicer):
    def __init__(
        self,
        collector: DailySearchCollectorPort,
        service_token: str | None = None,
        health_monitor: XCollectorHealthMonitor | None = None,
    ) -> None:
        self._collector = collector
        self._service_token = service_token
        self._health_monitor = health_monitor

    def CollectDailySearch(
        self,
        request: x_collector_pb2.CollectDailySearchRequest,
        context: grpc.ServicerContext,
    ) -> x_collector_pb2.CollectDailySearchResponse:
        require_service_token(context, self._service_token)

        try:
            result = self._collector.collect_daily_search(request_from_proto(request))
        except XCollectorError as exc:
            abort_collector_error(context, exc)
        except Exception:
            context.abort(
                grpc.StatusCode.UNAVAILABLE,
                "X collector unavailable",
            )

        return response_to_proto(
            result_with_health_warnings(result, self._health_monitor),
        )

    def CheckHealth(
        self,
        request: x_collector_pb2.CheckHealthRequest,
        context: grpc.ServicerContext,
    ) -> x_collector_pb2.CheckHealthResponse:
        del request
        require_service_token(context, self._service_token)

        warnings = (
            self._health_monitor.warnings()
            if self._health_monitor is not None
            else ()
        )
        status = (
            x_collector_pb2.X_COLLECTOR_HEALTH_STATUS_DEGRADED
            if warnings
            else x_collector_pb2.X_COLLECTOR_HEALTH_STATUS_SERVING
        )

        return x_collector_pb2.CheckHealthResponse(
            status=status,
            collector_engine="scweet",
            collector_version="scweet-5.3",
            warnings=[warning_to_proto(warning) for warning in warnings],
        )


def require_service_token(
    context: grpc.ServicerContext,
    service_token: str | None,
) -> None:
    if service_token is None:
        return

    expected = f"Bearer {service_token}"
    metadata = dict(context.invocation_metadata())
    if metadata.get("authorization") == expected:
        return

    context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid service token")


def request_from_proto(
    request: x_collector_pb2.CollectDailySearchRequest,
) -> DailySearchRequest:
    if request.schema_version not in {0, 1}:
        raise XCollectorInvalidRequestError("Unsupported schema version")

    query = request.query.strip()
    if len(query) < 2 or len(query) > 500:
        raise XCollectorInvalidRequestError("Query must be 2-500 characters")

    products = tuple(
        product
        for item in request.search_products
        if (product := search_product_from_proto(item)) is not None
    ) or (SearchProduct.TOP,)

    return DailySearchRequest(
        request_id=request.request_id.strip(),
        tenant_id=request.tenant_id.strip(),
        workspace_id=request.workspace_id.strip(),
        source_binding_id=request.source_binding_id.strip(),
        scan_job_id=request.scan_job_id.strip(),
        correlation_id=request.correlation_id.strip(),
        query=query,
        language=optional_string(request.language),
        window_hours=bounded_int(request.window_hours, 24, 1, 72),
        window_end=timestamp_to_datetime(request.window_end),
        search_products=products,
        limit_per_product=bounded_int(request.limit_per_product, 25, 1, 100),
        max_items=bounded_int(request.max_items, 25, 1, 100),
        min_likes=optional_uint(request.min_likes),
        min_retweets=optional_uint(request.min_retweets),
        min_replies=optional_uint(request.min_replies),
        cursor=optional_string(request.cursor),
    )


def response_to_proto(
    result: DailySearchResult,
) -> x_collector_pb2.CollectDailySearchResponse:
    return x_collector_pb2.CollectDailySearchResponse(
        schema_version=1,
        posts=[post_to_proto(post) for post in result.posts],
        next_cursor=result.next_cursor or "",
        warnings=[warning_to_proto(warning) for warning in result.warnings],
        run=run_to_proto(result.run),
    )


def result_with_health_warnings(
    result: DailySearchResult,
    health_monitor: XCollectorHealthMonitor | None,
) -> DailySearchResult:
    if health_monitor is None:
        return result

    health_warnings = health_monitor.warnings()
    if not health_warnings:
        return result

    return DailySearchResult(
        posts=result.posts,
        next_cursor=result.next_cursor,
        warnings=(*result.warnings, *health_warnings),
        run=result.run,
    )


def post_to_proto(post: XCollectedPost) -> x_collector_pb2.XCollectedPost:
    return x_collector_pb2.XCollectedPost(
        tweet_id=post.tweet_id,
        canonical_url=post.canonical_url,
        text=post.text,
        author_handle=post.author_handle or "",
        author_name=post.author_name or "",
        published_at=datetime_to_timestamp(post.published_at),
        metrics=metrics_to_proto(post.metrics),
        media_urls=list(post.media_urls),
        source_product=search_product_to_proto(post.source_product),
        trend_score=post.trend_score,
        content_kind=content_kind_to_proto(post.content_kind),
    )


def metrics_to_proto(metrics: XPostMetrics) -> x_collector_pb2.XPostMetrics:
    return x_collector_pb2.XPostMetrics(
        likes=max(metrics.likes, 0),
        retweets=max(metrics.retweets, 0),
        replies=max(metrics.replies, 0),
        quotes=max(metrics.quotes or 0, 0),
        views=max(metrics.views or 0, 0),
        quotes_observed=metrics.quotes is not None,
        views_observed=metrics.views is not None,
        likes_observed=metrics.likes_observed,
        retweets_observed=metrics.retweets_observed,
        eligibility_state=eligibility_metrics_state_to_proto(metrics.eligibility_state),
    )


def content_kind_to_proto(content_kind: XPostContentKind) -> int:
    match content_kind:
        case XPostContentKind.ORIGINAL:
            return x_collector_pb2.X_POST_CONTENT_KIND_ORIGINAL
        case XPostContentKind.REPLY:
            return x_collector_pb2.X_POST_CONTENT_KIND_REPLY
        case XPostContentKind.QUOTE:
            return x_collector_pb2.X_POST_CONTENT_KIND_QUOTE
        case XPostContentKind.UNKNOWN:
            return x_collector_pb2.X_POST_CONTENT_KIND_UNSPECIFIED


def eligibility_metrics_state_to_proto(state: XEligibilityMetricsState) -> int:
    match state:
        case XEligibilityMetricsState.OBSERVED:
            return x_collector_pb2.X_ELIGIBILITY_METRICS_STATE_OBSERVED
        case XEligibilityMetricsState.MISSING:
            return x_collector_pb2.X_ELIGIBILITY_METRICS_STATE_MISSING
        case XEligibilityMetricsState.MALFORMED:
            return x_collector_pb2.X_ELIGIBILITY_METRICS_STATE_MALFORMED
        case XEligibilityMetricsState.CONFLICT:
            return x_collector_pb2.X_ELIGIBILITY_METRICS_STATE_CONFLICT


def warning_to_proto(
    warning: XCollectorWarning,
) -> x_collector_pb2.XCollectorWarning:
    return x_collector_pb2.XCollectorWarning(
        code=warning.code,
        message=warning.message,
    )


def run_to_proto(run: XCollectorRun) -> x_collector_pb2.XCollectorRun:
    return x_collector_pb2.XCollectorRun(
        collector_engine=run.collector_engine,
        collector_version=run.collector_version,
        started_at=datetime_to_timestamp(run.started_at),
        completed_at=datetime_to_timestamp(run.completed_at),
        requested_limit=run.requested_limit,
        fetched_count=run.fetched_count,
        returned_count=run.returned_count,
        partial=run.partial,
    )


def search_product_from_proto(value: int) -> SearchProduct | None:
    if value == x_collector_pb2.X_SEARCH_PRODUCT_TOP:
        return SearchProduct.TOP
    if value == x_collector_pb2.X_SEARCH_PRODUCT_LATEST:
        return SearchProduct.LATEST
    return None


def search_product_to_proto(product: SearchProduct) -> int:
    match product:
        case SearchProduct.TOP:
            return x_collector_pb2.X_SEARCH_PRODUCT_TOP
        case SearchProduct.LATEST:
            return x_collector_pb2.X_SEARCH_PRODUCT_LATEST


def timestamp_to_datetime(value: Timestamp) -> datetime:
    if value.seconds == 0 and value.nanos == 0:
        return datetime.now(UTC)

    return value.ToDatetime(tzinfo=UTC)


def datetime_to_timestamp(value: datetime) -> Timestamp:
    timestamp = Timestamp()
    timestamp.FromDatetime(value.astimezone(UTC))
    return timestamp


def optional_string(value: str) -> str | None:
    stripped = value.strip()
    return stripped or None


def optional_uint(value: int) -> int | None:
    return value if value > 0 else None


def bounded_int(value: int, fallback: int, minimum: int, maximum: int) -> int:
    if value < minimum:
        return fallback

    return min(value, maximum)


def abort_collector_error(
    context: grpc.ServicerContext,
    exc: XCollectorError,
) -> Any:
    if isinstance(exc, XCollectorInvalidRequestError):
        context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))

    if isinstance(exc, XCollectorAuthError):
        context.abort(grpc.StatusCode.UNAUTHENTICATED, str(exc))

    if isinstance(exc, XCollectorRateLimitError):
        metadata = []
        if exc.retry_after_ms is not None:
            metadata.append(("retry-after-ms", str(exc.retry_after_ms)))
        if exc.reset_at is not None:
            metadata.append(
                (
                    "rate-limit-reset-at",
                    exc.reset_at.astimezone(UTC).isoformat(),
                ),
            )
        if metadata:
            context.set_trailing_metadata(tuple(metadata))
        context.abort(grpc.StatusCode.RESOURCE_EXHAUSTED, str(exc))

    if isinstance(exc, XCollectorUnavailableError):
        context.abort(grpc.StatusCode.UNAVAILABLE, str(exc))

    context.abort(grpc.StatusCode.UNKNOWN, "X collector failed")
