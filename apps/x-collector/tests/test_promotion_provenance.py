from datetime import UTC, datetime

from x_collector.domain import (
    SearchProduct,
    XCollectedPost,
    XEligibilityMetricsState,
    XPostContentKind,
    XPostMetrics,
)
from x_collector.grpc_service import post_to_proto
from x_collector.scweet_adapter import (
    content_kind_from_scweet_record,
    eligibility_metrics_state,
)
from x_collector.v1 import x_collector_pb2


def test_content_provenance_is_explicit_and_unknown_fails_closed() -> None:
    assert content_kind_from_scweet_record({}) is XPostContentKind.UNKNOWN
    assert (
        content_kind_from_scweet_record({"replying_to": []})
        is XPostContentKind.ORIGINAL
    )
    assert (
        content_kind_from_scweet_record({"replying_to": [{"id": "parent"}]})
        is XPostContentKind.REPLY
    )
    assert (
        content_kind_from_scweet_record(
            {"replying_to": [], "quoted_status_id": "quoted"},
        )
        is XPostContentKind.QUOTE
    )


def test_content_provenance_reads_scweet_53_raw_legacy() -> None:
    original = {
        "raw": {
            "tweet": {
                "legacy": {
                    "in_reply_to_status_id_str": None,
                    "is_quote_status": False,
                },
            },
        },
    }
    reply = {
        "raw": {
            "legacy": {
                "in_reply_to_status_id_str": "1956000000000000001",
                "is_quote_status": False,
            },
        },
    }
    quote = {
        "raw": {
            "legacy": {
                "in_reply_to_status_id_str": None,
                "is_quote_status": True,
            },
        },
    }
    retweet = {
        "raw": {
            "legacy": {
                "in_reply_to_status_id_str": None,
                "is_quote_status": False,
                "retweeted_status_result": {"result": {"rest_id": "1"}},
            },
        },
    }

    assert content_kind_from_scweet_record(original) is XPostContentKind.ORIGINAL
    assert content_kind_from_scweet_record(reply) is XPostContentKind.REPLY
    assert content_kind_from_scweet_record(quote) is XPostContentKind.QUOTE
    assert content_kind_from_scweet_record(retweet) is XPostContentKind.UNKNOWN


def test_content_provenance_requires_explicit_raw_originality_fields() -> None:
    assert content_kind_from_scweet_record({"raw": {"legacy": {}}}) is (
        XPostContentKind.UNKNOWN
    )
    assert content_kind_from_scweet_record({
        "raw": {"legacy": {"in_reply_to_status_id_str": None}},
    }) is XPostContentKind.UNKNOWN
    assert content_kind_from_scweet_record({
        "raw": {"legacy": {"is_quote_status": False}},
    }) is XPostContentKind.UNKNOWN


def test_required_metric_presence_is_not_defaulted_to_zero() -> None:
    assert eligibility_metrics_state(((None, None), (10, 10))) is (
        XEligibilityMetricsState.MISSING
    )
    assert eligibility_metrics_state((("many", None), (10, 10))) is (
        XEligibilityMetricsState.MALFORMED
    )
    assert eligibility_metrics_state(((0, 0), (0, 0))) is (
        XEligibilityMetricsState.OBSERVED
    )


def test_promotion_provenance_survives_python_protobuf_serialization() -> None:
    encoded = post_to_proto(XCollectedPost(
        tweet_id="1956000000000000000",
        canonical_url="https://x.com/example/status/1956000000000000000",
        text="Quoted context",
        author_handle="example",
        author_name="Example",
        published_at=datetime(2026, 8, 14, 12, tzinfo=UTC),
        metrics=XPostMetrics(
            likes=0,
            retweets=0,
            replies=0,
            likes_observed=True,
            retweets_observed=True,
            eligibility_state=XEligibilityMetricsState.CONFLICT,
        ),
        media_urls=(),
        source_product=SearchProduct.LATEST,
        trend_score=1,
        content_kind=XPostContentKind.QUOTE,
    )).SerializeToString()
    decoded = x_collector_pb2.XCollectedPost.FromString(encoded)

    assert decoded.content_kind == x_collector_pb2.X_POST_CONTENT_KIND_QUOTE
    assert decoded.metrics.eligibility_state == (
        x_collector_pb2.X_ELIGIBILITY_METRICS_STATE_CONFLICT
    )
    assert decoded.metrics.likes_observed is True
    assert decoded.metrics.retweets_observed is True
