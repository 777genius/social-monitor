from __future__ import annotations

import logging
from datetime import UTC, datetime

from x_collector.domain import (
    DailySearchResult,
    XCollectorRun,
)
from x_collector.grpc_service import XCollectorGrpcService
from x_collector.health import (
    ScweetManifestHealthLogHandler,
    XCollectorHealthMonitor,
)
from x_collector.v1 import x_collector_pb2


def test_manifest_log_handler_degrades_and_recovers_health() -> None:
    monitor = XCollectorHealthMonitor()
    handler = ScweetManifestHealthLogHandler(monitor)

    handler.handle(log_record("Live manifest scrape failed; continuing with cached manifest"))

    warnings = monitor.warnings()
    assert len(warnings) == 1
    assert warnings[0].code == "x_collector.manifest_scrape_failed"

    handler.handle(log_record("Live manifest scraped successfully query_ids=['search_timeline']"))

    assert monitor.warnings() == ()


def test_health_response_reports_manifest_degraded_state() -> None:
    monitor = XCollectorHealthMonitor()
    monitor.record_manifest_scrape_failed()
    service = XCollectorGrpcService(
        EmptyCollector(),
        health_monitor=monitor,
    )

    response = service.CheckHealth(
        x_collector_pb2.CheckHealthRequest(service="test"),
        FakeContext(),
    )

    assert response.status == x_collector_pb2.X_COLLECTOR_HEALTH_STATUS_DEGRADED
    assert response.warnings[0].code == "x_collector.manifest_scrape_failed"


def test_collect_daily_search_appends_manifest_health_warning() -> None:
    monitor = XCollectorHealthMonitor()
    monitor.record_manifest_scrape_failed()
    service = XCollectorGrpcService(
        EmptyCollector(),
        health_monitor=monitor,
    )

    response = service.CollectDailySearch(
        x_collector_pb2.CollectDailySearchRequest(
            schema_version=1,
            request_id="request-1",
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            source_binding_id="binding-1",
            scan_job_id="scan-1",
            correlation_id="corr-1",
            query="openai",
        ),
        FakeContext(),
    )

    assert response.warnings[0].code == "x_collector.manifest_scrape_failed"


class EmptyCollector:
    def collect_daily_search(self, _request: object) -> DailySearchResult:
        now = datetime(2026, 6, 27, 12, tzinfo=UTC)

        return DailySearchResult(
            posts=(),
            next_cursor=None,
            warnings=(),
            run=XCollectorRun(
                collector_engine="scweet",
                collector_version="scweet-5.3",
                started_at=now,
                completed_at=now,
                requested_limit=0,
                fetched_count=0,
                returned_count=0,
                partial=False,
            ),
        )


class FakeContext:
    def invocation_metadata(self) -> tuple[object, ...]:
        return ()

    def abort(self, *_: object) -> None:
        raise RuntimeError("unexpected abort")


def log_record(message: str) -> logging.LogRecord:
    return logging.LogRecord(
        "Scweet.client",
        logging.ERROR,
        __file__,
        1,
        message,
        (),
        None,
    )
