from __future__ import annotations

import unittest
from typing import cast

from x_collector.config import XCollectorSettings
from x_collector.domain import DailySearchRequest, DailySearchResult
from x_collector.ports import DailySearchCollectorPort
from x_collector.reloading_scweet_collector import (
    ReloadingScweetDailySearchCollector,
)


class StubCollector:
    def __init__(self, result: DailySearchResult) -> None:
        self._result = result

    def collect_daily_search(
        self,
        request: DailySearchRequest,
    ) -> DailySearchResult:
        return self._result


def test_reloads_adaptive_limits_for_every_request() -> None:
    settings = cast(XCollectorSettings, object())
    request = cast(DailySearchRequest, object())
    results = [
        cast(DailySearchResult, object()),
        cast(DailySearchResult, object()),
    ]
    builds: list[XCollectorSettings] = []

    def build(value: XCollectorSettings) -> DailySearchCollectorPort:
        builds.append(value)
        return StubCollector(results[len(builds) - 1])

    collector = ReloadingScweetDailySearchCollector(settings, build)

    assert collector.collect_daily_search(request) is results[0]
    assert collector.collect_daily_search(request) is results[1]
    assert builds == [settings, settings]


class ExecutionFailureDiagnosticTests(unittest.TestCase):
    def test_logs_stage_and_class_without_private_detail(self) -> None:
        """A post-setup pre-run crash must be distinguishable without leaking its text."""
        private_detail = "synthetic-query-cookie-token"

        class FailingCollector:
            def collect_daily_search(self, _request: DailySearchRequest) -> DailySearchResult:
                raise RuntimeError(private_detail)

        collector = ReloadingScweetDailySearchCollector(
            cast(XCollectorSettings, object()),
            lambda _settings: FailingCollector(),
        )
        with self.assertLogs("x_collector.reloading_scweet_collector", "ERROR") as logs:
            with self.assertRaisesRegex(RuntimeError, private_detail):
                collector.collect_daily_search(cast(DailySearchRequest, object()))

        self.assertEqual(
            logs.output,
            ["ERROR:x_collector.reloading_scweet_collector:"
             "X collector failure stage=collector_run error_class=RuntimeError"],
        )
        self.assertTrue(all(record.exc_info is None for record in logs.records))


def test_normal_server_composition_forwards_each_lookup_through_reloading_factory() -> None:
    from unittest.mock import patch
    from datetime import UTC, datetime
    from x_collector.domain import XCollectorRun
    import grpc
    from x_collector import server as server_module
    from x_collector.v1 import x_collector_pb2 as wire
    from x_collector.v1 import x_collector_pb2_grpc as rpc

    settings = XCollectorSettings.from_env({"X_COLLECTOR_GRPC_BIND": "127.0.0.1:0"})
    builds = []
    requests = []

    class LookupCollector:
        def lookup_posts(self, request):
            requests.append(request)
            now = datetime(2026, 11, 3, tzinfo=UTC)
            return DailySearchResult((), None, (), XCollectorRun(
                "scweet_post_lookup", "test", now, now, 1, 0, 0, True))

    def build(current):
        builds.append(current)
        return LookupCollector()

    with patch.object(server_module, "ReloadingScweetDailySearchCollector",
                      side_effect=lambda current: ReloadingScweetDailySearchCollector(current, build)), \
         patch.object(server_module, "install_scweet_manifest_health_monitor"):
        server = server_module.create_server(settings)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    channel = grpc.insecure_channel(f"127.0.0.1:{port}", options=[("grpc.enable_retries", 0)])
    try:
        for index in range(2):
            response = rpc.XCollectorServiceStub(channel).LookupPosts(wire.LookupPostsRequest(
                schema_version=1, request_id=f"request-{index}", tenant_id="tenant",
                workspace_id="workspace", source_binding_id="binding", scan_job_id="scan",
                correlation_id="correlation", tweet_ids=["200"]), timeout=5)
            assert response.schema_version == 1
        assert builds == [settings, settings]
        assert [request.request_id for request in requests] == ["request-0", "request-1"]
        assert all(request.tweet_ids == ("200",) for request in requests)
    finally:
        channel.close()
        server.stop(grace=0).wait()
