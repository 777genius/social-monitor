from __future__ import annotations

from datetime import datetime
from typing import Mapping, Protocol

from .account_pool import AccountPoolSnapshot
from .account_usage import AccountUsageEvent, SearchPassUsage
from .candidate_rejection_cache import (
    CandidateRejection,
    CandidateRejectionScope,
)
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


class CandidateRejectionRepositoryPort(Protocol):
    def load_rejections(
        self,
        scope: CandidateRejectionScope,
        tweet_ids: tuple[str, ...],
    ) -> Mapping[str, CandidateRejection]:
        raise NotImplementedError

    def record_outcomes(
        self,
        scope: CandidateRejectionScope,
        selected_tweet_ids: tuple[str, ...],
        rejections: tuple[CandidateRejection, ...],
        now: datetime,
    ) -> None:
        raise NotImplementedError

    def mark_seen(
        self,
        scope: CandidateRejectionScope,
        tweet_ids: tuple[str, ...],
        now: datetime,
    ) -> None:
        raise NotImplementedError

class AccountPoolLedgerPort(Protocol):
    def snapshot(self, now: datetime) -> AccountPoolSnapshot | None:
        raise NotImplementedError

    def apply_profile_cooldowns(self, now: datetime) -> None:
        raise NotImplementedError

    def apply_collection_priorities(self, now: datetime) -> None:
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
