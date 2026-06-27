from __future__ import annotations

from datetime import datetime
from typing import Protocol

from .domain import DailySearchRequest, DailySearchResult


class Clock(Protocol):
    def now(self) -> datetime:
        raise NotImplementedError


class DailySearchCollectorPort(Protocol):
    def collect_daily_search(
        self,
        request: DailySearchRequest,
    ) -> DailySearchResult:
        raise NotImplementedError

