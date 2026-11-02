from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from x_collector.domain import PostLookupRequest, SearchProduct, XCollectorRateLimitError
from x_collector.quoted_post import quoted_post_from_scweet_record
from x_collector.scweet_adapter import post_from_scweet_record
from x_collector.grpc_service import post_to_proto
from x_collector.post_lookup import execute_post_lookup


def record(tweet_id="200"):
    return {"tweet_id": tweet_id, "tweet_url": f"https://x.com/quoting/status/{tweet_id}",
            "text": "My own measured conclusion.", "timestamp": "2026-11-01T12:00:00Z",
            "user": {"screen_name": "quoting"}, "likes": 10, "retweets": 1,
            "comments": 0, "is_quote": True,
            "quoted_tweet": {"tweet_id": "100", "tweet_url": "https://x.com/original/status/100",
                             "text": "The original experiment and its measured results.",
                             "timestamp": "2026-11-01T11:00:00Z",
                             "user": {"screen_name": "original"}, "likes": 999999}}


def test_embedded_full_context_has_separate_identity_author_and_no_metrics():
    post = post_from_scweet_record(record(), SearchProduct.TOP)
    assert post.text == "My own measured conclusion."
    assert post.metrics.likes == 10
    assert post.quoted_post.tweet_id == "100"
    assert post.quoted_post.author_handle == "original"
    wire = post_to_proto(post)
    assert wire.quoted_post.text == record()["quoted_tweet"]["text"]
    assert wire.text == post.text
    assert not hasattr(wire.quoted_post, "metrics")


@pytest.mark.parametrize("change", [
    {"tweet_id": "200"}, {"tweet_url": "https://evil.test/original/status/100"},
    {"tweet_url": "https://x.com/wrong/status/100"}, {"text": ""},
    {"timestamp": "2026-11-01T11:00:00"}, {"user": {"screen_name": "bad/name"}},
])
def test_invalid_embedded_context_is_not_substituted(change):
    value = record()
    value["quoted_tweet"].update(change)
    assert quoted_post_from_scweet_record(value) is None


def test_truncated_display_text_or_conflicting_quote_id_cannot_establish_capture():
    assert quoted_post_from_scweet_record({"embedded_text": "A preview only"}) is None
    assert quoted_post_from_scweet_record({**record(), "quoted_status_id": "101"}) is None


def lookup_request(ids=("200", "201")):
    return PostLookupRequest("request", "tenant", "workspace", "binding", "scan", "correlation", ids)


class Observer:
    def __init__(self):
        self.started = self.succeeded = self.failed = 0

    def begin_lookup(self, request):
        from x_collector.account_usage_observer import NoopAccountUsageObserver
        self.started += 1
        return NoopAccountUsageObserver().begin_lookup(request)

    def complete_pass_success(self, *args, **kwargs):
        self.succeeded += 1

    def complete_pass_failure(self, *args, **kwargs):
        self.failed += 1


def test_known_id_lookup_is_bounded_accounted_and_missing_is_partial():
    calls = []
    observer = Observer()
    client = SimpleNamespace(get_tweet_info=lambda ids, **kwargs: calls.append((ids, kwargs)) or [record(), record("999")])
    clock = SimpleNamespace(now=lambda: datetime(2026, 11, 2, tzinfo=UTC))
    ledger = SimpleNamespace(snapshot=lambda now: SimpleNamespace(total_remaining_requests=1, total_remaining_tweets=50))
    result = execute_post_lookup(lookup_request(), clock=clock, ledger=ledger,
        prepare_accounts=lambda: None, observer=observer, start_execution=lambda: client,
        normalize_record=post_from_scweet_record, classify_error=lambda e: e, db_path=None)
    assert calls == [(["200", "201"], {"save": False})]
    assert len(result.posts) == 1 and result.posts[0].tweet_id == "200"
    assert result.posts[0].source_product is SearchProduct.ID_LOOKUP
    assert result.run.partial is True
    assert observer.started == observer.succeeded == 1 and observer.failed == 0


def test_depleted_budget_prevents_client_construction_and_transport_failure_never_retries():
    attempts = []
    observer = Observer()
    clock = SimpleNamespace(now=lambda: datetime(2026, 11, 2, tzinfo=UTC))
    ledger = SimpleNamespace(snapshot=lambda now: SimpleNamespace(total_remaining_requests=0, total_remaining_tweets=50))
    args = dict(clock=clock, ledger=ledger, prepare_accounts=lambda: None,
        observer=observer, start_execution=lambda: attempts.append("constructed"),
        normalize_record=post_from_scweet_record, classify_error=lambda e: e, db_path=None)
    with pytest.raises(XCollectorRateLimitError):
        execute_post_lookup(lookup_request(), **args)
    assert not attempts and not observer.started
    ledger.snapshot = lambda now: SimpleNamespace(total_remaining_requests=1, total_remaining_tweets=50)
    def fail(ids, **kwargs):
        attempts.append("lookup")
        raise RuntimeError("transport failed")
    args["start_execution"] = lambda: SimpleNamespace(get_tweet_info=fail)
    with pytest.raises(RuntimeError):
        execute_post_lookup(lookup_request(), **args)
    assert attempts == ["lookup"] and observer.failed == 1


@pytest.mark.parametrize("ids", [(), ("200", "200"), ("no-id",), tuple(str(i + 1) for i in range(51))])
def test_invalid_lookup_has_zero_external_effects(ids):
    from x_collector.domain import XCollectorInvalidRequestError
    with pytest.raises(XCollectorInvalidRequestError):
        execute_post_lookup(lookup_request(ids), clock=None, ledger=None,
            prepare_accounts=None, observer=None, start_execution=None,
            normalize_record=None, classify_error=None, db_path=None)


def test_lookup_sdk_factory_disables_query_replay_without_changing_normal_search(tmp_path):
    from unittest.mock import patch
    from x_collector.config import XCollectorSettings
    from x_collector.scweet_adapter import ScweetDailySearchCollector
    settings = XCollectorSettings.from_env({"X_COLLECTOR_SCWEET_DB_PATH": str(tmp_path / "synthetic.db")})
    configurations = []
    with patch("Scweet.Scweet", side_effect=lambda **kwargs: configurations.append(kwargs["config"])):
        collector = ScweetDailySearchCollector.from_settings(settings)
        collector._post_lookup_factory()
        collector._scweet_factory()
    assert [value.request_404_retries for value in configurations] == [0, 1]
