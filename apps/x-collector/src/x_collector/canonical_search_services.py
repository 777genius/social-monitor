"""Injected ordinary capabilities and detached observation facts, with no I/O."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Mapping, Protocol

from .account_usage import SearchPassUsage
from .candidate_rejection_cache import (
    CandidateRejection, CandidateRejectionPolicy, CandidateRejectionScope,
)
from .domain import DailySearchRequest, DailySearchResult, SearchProduct, XCollectedPost
from .ports import AccountUsageObserverPort, CandidateRejectionRepositoryPort, Clock
from .scoring import CandidateSignal
from .search_budget import SearchBudgetDecision
from .search_plan import ScweetSearchPass


class PassExecutor(Protocol):
    def __call__(self, session: Any, *, request: DailySearchRequest,
                 search_pass: ScweetSearchPass, since: str, until: str
                 ) -> tuple[list[Mapping[str, Any]], Any, SearchPassUsage, int]: ...


@dataclass(frozen=True)
class CanonicalSearchServices:
    clock: Clock
    start_execution: Callable[[], Any]
    prepare_account_pool: Callable[[], None]
    date_window: Callable[[DailySearchRequest], tuple[str, str]]
    budget_search_passes: Callable[[tuple[ScweetSearchPass, ...]], SearchBudgetDecision]
    account_usage_observer: AccountUsageObserverPort
    execute_pass: PassExecutor
    normalize_record: Callable[[Mapping[str, Any], SearchProduct], XCollectedPost | None]
    in_window: Callable[[XCollectedPost, DailySearchRequest], bool]
    account_budget_is_depleted: Callable[[], bool]
    rejection_repository: CandidateRejectionRepositoryPort | None
    rejection_policy: CandidateRejectionPolicy


@dataclass(frozen=True)
class PassRecord:
    """Rank is after the existing Mapping boundary, before validity/window filtering."""
    rank: int
    post: XCollectedPost | None
    in_window: bool


@dataclass(frozen=True)
class ChosenOrigin:
    tweet_id: str
    chosen_signal: CandidateSignal
    all_candidate_signals: tuple[CandidateSignal, ...]


@dataclass(frozen=True)
class CacheObservation:
    operation: str
    outcome: str
    scope: CandidateRejectionScope | None = None
    ids: tuple[str, ...] = ()
    at: datetime | None = None
    rejections: tuple[tuple[str, CandidateRejection], ...] = ()
    outcomes: tuple[CandidateRejection, ...] = ()


class CanonicalSearchObserver(Protocol):
    def on_pass_records(self, search_pass: ScweetSearchPass,
                        records_with_original_rank: tuple[PassRecord, ...]) -> None: ...

    def on_cache_observation(self, observation: CacheObservation) -> None: ...

    def on_invocation_return(self, actual_result: DailySearchResult,
                             chosen_origins: tuple[ChosenOrigin, ...]) -> None: ...


class CanonicalObservationError(Exception):
    """Capture failed. No complete invocation evidence may be published or replayed."""
