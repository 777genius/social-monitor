from __future__ import annotations

from datetime import datetime
from typing import Protocol

from .account_pool import AccountPoolSnapshot
from .account_usage import AccountUsageEvent, SearchPassUsage
from .domain import DailySearchRequest, DailySearchResult
from .search_budget import SearchBudgetDecision
from .search_plan import ScweetSearchPass


class Clock(Protocol):
    def now(self) -> datetime:
        raise NotImplementedError


class DailySearchCollectorPort(Protocol):
    def collect_daily_search(
        self,
        request: DailySearchRequest,
    ) -> DailySearchResult:
        raise NotImplementedError


class AccountPoolLedgerPort(Protocol):
    def snapshot(self, now: datetime) -> AccountPoolSnapshot | None:
        raise NotImplementedError


class AccountUsageEventRepositoryPort(Protocol):
    def append_events(self, events: tuple[AccountUsageEvent, ...]) -> None:
        raise NotImplementedError


class AccountUsageObserverPort(Protocol):
    def record_budget_decision(
        self,
        request: DailySearchRequest,
        decision: SearchBudgetDecision,
    ) -> None:
        raise NotImplementedError

    def begin_pass(
        self,
        request: DailySearchRequest,
        search_pass: ScweetSearchPass,
        estimated_request_cost: int,
    ) -> SearchPassUsage:
        raise NotImplementedError

    def complete_pass_success(
        self,
        request: DailySearchRequest,
        usage: SearchPassUsage,
        *,
        fetched_count: int,
        accepted_count: int,
    ) -> None:
        raise NotImplementedError

    def complete_pass_failure(
        self,
        request: DailySearchRequest,
        usage: SearchPassUsage,
        *,
        failure_kind: str,
        reset_at: datetime | None = None,
    ) -> None:
        raise NotImplementedError
