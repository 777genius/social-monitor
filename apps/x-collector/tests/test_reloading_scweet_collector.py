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
