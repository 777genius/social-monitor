from __future__ import annotations

import os
from concurrent import futures
from datetime import UTC, datetime
from pathlib import Path

import pytest


pytestmark = pytest.mark.real_e2e


def test_real_x_collector_grpc_daily_search(tmp_path: Path) -> None:
    if os.environ.get("X_COLLECTOR_REAL_E2E") != "1":
        pytest.skip("Set X_COLLECTOR_REAL_E2E=1 to run live X collector e2e")

    cookies_file = os.environ.get("X_COLLECTOR_SCWEET_COOKIES_FILE")
    if not cookies_file or not Path(cookies_file).exists():
        pytest.skip("Set X_COLLECTOR_SCWEET_COOKIES_FILE to a local cookies.json")

    import grpc

    from x_collector.config import XCollectorSettings
    from x_collector.grpc_service import XCollectorGrpcService
    from x_collector.scweet_adapter import ScweetDailySearchCollector
    from x_collector.v1 import x_collector_pb2, x_collector_pb2_grpc

    service_token = "real-e2e-token"
    settings = XCollectorSettings(
        grpc_bind="127.0.0.1:0",
        max_workers=2,
        service_token=service_token,
        scweet_cookies_file=cookies_file,
        scweet_auth_token=None,
        scweet_db_path=str(tmp_path / "scweet_state.db"),
        scweet_proxy=os.environ.get("X_COLLECTOR_SCWEET_PROXY"),
        scweet_manifest_scrape_on_init=True,
        scweet_daily_requests_limit=12,
        scweet_daily_tweets_limit=80,
        scweet_requests_per_minute=6,
        scweet_min_delay_seconds=1.0,
        scweet_n_splits=1,
        scweet_api_page_size=20,
        scweet_max_empty_pages=1,
    )
    collector = ScweetDailySearchCollector.from_settings(settings)
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    x_collector_pb2_grpc.add_XCollectorServiceServicer_to_server(
        XCollectorGrpcService(collector, service_token=service_token),
        server,
    )
    port = server.add_insecure_port(settings.grpc_bind)
    server.start()

    try:
        channel = grpc.insecure_channel(f"127.0.0.1:{port}")
        grpc.channel_ready_future(channel).result(timeout=10)
        stub = x_collector_pb2_grpc.XCollectorServiceStub(channel)
        metadata = (("authorization", f"Bearer {service_token}"),)

        health = stub.CheckHealth(
            x_collector_pb2.CheckHealthRequest(service="real-e2e"),
            metadata=metadata,
            timeout=10,
        )
        assert health.status == x_collector_pb2.X_COLLECTOR_HEALTH_STATUS_SERVING

        response = stub.CollectDailySearch(
            request=query_request(),
            metadata=metadata,
            timeout=120,
        )
    finally:
        server.stop(grace=0)

    assert response.schema_version == 1
    assert response.run.collector_engine == "scweet"
    assert response.run.requested_limit == 3
    assert response.run.returned_count == len(response.posts)
    assert response.posts, "expected at least one live X post"
    assert all(post.tweet_id for post in response.posts)
    assert all(post.canonical_url.startswith("https://x.com/") for post in response.posts)
    assert all(post.trend_score >= 0 for post in response.posts)


def query_request():
    from google.protobuf.timestamp_pb2 import Timestamp
    from x_collector.v1 import x_collector_pb2

    window_end = Timestamp()
    window_end.FromDatetime(datetime.now(UTC))

    return x_collector_pb2.CollectDailySearchRequest(
        schema_version=1,
        request_id="real-e2e-request",
        tenant_id="tenant-real-e2e",
        workspace_id="workspace-real-e2e",
        source_binding_id="binding-real-e2e",
        scan_job_id="scan-real-e2e",
        correlation_id="corr-real-e2e",
        query=os.environ.get("X_COLLECTOR_REAL_E2E_QUERY", "openai"),
        language=os.environ.get("X_COLLECTOR_REAL_E2E_LANG", "en"),
        window_hours=int(os.environ.get("X_COLLECTOR_REAL_E2E_WINDOW_HOURS", "24")),
        window_end=window_end,
        search_products=[
            x_collector_pb2.X_SEARCH_PRODUCT_TOP,
            x_collector_pb2.X_SEARCH_PRODUCT_LATEST,
        ],
        limit_per_product=3,
        max_items=3,
        min_likes=int(os.environ.get("X_COLLECTOR_REAL_E2E_MIN_LIKES", "1")),
        min_retweets=0,
        min_replies=0,
    )
