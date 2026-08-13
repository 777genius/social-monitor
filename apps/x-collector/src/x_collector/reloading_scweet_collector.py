from __future__ import annotations

from collections.abc import Callable

from .config import XCollectorSettings
from .domain import DailySearchRequest, DailySearchResult
from .ports import DailySearchCollectorPort
from .scweet_adapter import ScweetDailySearchCollector


class ReloadingScweetDailySearchCollector(DailySearchCollectorPort):
    """Reload adaptive account budgets from the durable ledger for each RPC."""

    def __init__(
        self,
        settings: XCollectorSettings,
        factory: Callable[
            [XCollectorSettings], DailySearchCollectorPort
        ] = ScweetDailySearchCollector.from_settings,
    ) -> None:
        self._settings = settings
        self._factory = factory

    def collect_daily_search(
        self,
        request: DailySearchRequest,
    ) -> DailySearchResult:
        return self._factory(self._settings).collect_daily_search(request)
