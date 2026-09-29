from __future__ import annotations

import logging
from collections.abc import Callable

from .config import XCollectorSettings
from .domain import DailySearchRequest, DailySearchResult
from .ports import DailySearchCollectorPort
from .scweet_adapter import ScweetDailySearchCollector


LOGGER = logging.getLogger(__name__)


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
        try:
            collector = self._factory(self._settings)
        except Exception as exc:
            LOGGER.error(
                "X collector failure stage=collector_setup error_class=%s",
                type(exc).__name__,
            )
            raise
        try:
            return collector.collect_daily_search(request)
        except Exception as exc:
            LOGGER.error(
                "X collector failure stage=collector_run error_class=%s",
                type(exc).__name__,
            )
            raise
