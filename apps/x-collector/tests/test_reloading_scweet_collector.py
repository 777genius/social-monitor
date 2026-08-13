from __future__ import annotations

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
