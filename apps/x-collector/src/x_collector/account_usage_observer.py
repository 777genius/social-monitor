from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable
from uuid import uuid4

from .account_pool import AccountCapacity, AccountPoolSnapshot
from .account_usage import (
    AccountUsageAttributionStatus,
    AccountUsageDelta,
    AccountUsageEvent,
    AccountUsageEventType,
    SearchPassUsage,
    account_usage_deltas,
)
from .domain import DailySearchRequest
from .ports import AccountPoolLedgerPort, AccountUsageEventRepositoryPort, Clock
from .search_budget import SearchBudgetDecision
from .search_plan import ScweetSearchPass


X_TWITTER_PROVIDER = "x-twitter"
EventIdFactory = Callable[[], str]


@dataclass(frozen=True)
class NoopAccountUsageObserver:
    def record_budget_decision(
        self,
        request: DailySearchRequest,
        decision: SearchBudgetDecision,
    ) -> None:
        del request, decision

    def begin_pass(
        self,
        request: DailySearchRequest,
        search_pass: ScweetSearchPass,
        estimated_request_cost: int,
    ) -> SearchPassUsage:
        return SearchPassUsage(
            request_id=request.request_id,
            scan_job_id=request.scan_job_id,
            pass_label=search_pass.label,
            product=search_pass.product.value,
            estimated_request_cost=estimated_request_cost,
            before_snapshot=None,
        )

    def complete_pass_success(
        self,
        request: DailySearchRequest,
        usage: SearchPassUsage,
        *,
        fetched_count: int,
        accepted_count: int,
    ) -> None:
        del request, usage, fetched_count, accepted_count

    def complete_pass_failure(
        self,
        request: DailySearchRequest,
        usage: SearchPassUsage,
        *,
        failure_kind: str,
        reset_at: datetime | None = None,
    ) -> None:
        del request, usage, failure_kind, reset_at


class AccountUsageObserver:
    def __init__(
        self,
        ledger: AccountPoolLedgerPort,
        repository: AccountUsageEventRepositoryPort,
        clock: Clock,
        event_id_factory: EventIdFactory | None = None,
    ) -> None:
        self._ledger = ledger
        self._repository = repository
        self._clock = clock
        self._event_id_factory = event_id_factory or (lambda: str(uuid4()))

    def record_budget_decision(
        self,
        request: DailySearchRequest,
        decision: SearchBudgetDecision,
    ) -> None:
        def build() -> tuple[AccountUsageEvent, ...]:
            snapshot = self._snapshot()
            accounts = snapshot.accounts if snapshot is not None else ()
            if not accounts:
                return (
                    self._event(
                        request,
                        AccountUsageEventType.BUDGET_SNAPSHOT,
                        estimated_request_cost=decision.estimated_request_cost,
                    ),
                )

            return tuple(
                self._event(
                    request,
                    AccountUsageEventType.BUDGET_SNAPSHOT,
                    account=account,
                    estimated_request_cost=decision.estimated_request_cost,
                    requests_before=account.daily_requests,
                    requests_after=account.daily_requests,
                    tweets_before=account.daily_tweets,
                    tweets_after=account.daily_tweets,
                    cooldown_reason=account.cooldown_reason,
                    reset_at=account.available_at,
                )
                for account in accounts
            )

        self._append_safely(build)

    def begin_pass(
        self,
        request: DailySearchRequest,
        search_pass: ScweetSearchPass,
        estimated_request_cost: int,
    ) -> SearchPassUsage:
        before_snapshot = self._snapshot_safely()
        usage = SearchPassUsage(
            request_id=request.request_id,
            scan_job_id=request.scan_job_id,
            pass_label=search_pass.label,
            product=search_pass.product.value,
            estimated_request_cost=estimated_request_cost,
            before_snapshot=before_snapshot,
        )

        self._append_safely(
            lambda: (
                self._event(
                    request,
                    AccountUsageEventType.PASS_STARTED,
                    usage=usage,
                    estimated_request_cost=estimated_request_cost,
                ),
            ),
        )

        return usage

    def complete_pass_success(
        self,
        request: DailySearchRequest,
        usage: SearchPassUsage,
        *,
        fetched_count: int,
        accepted_count: int,
    ) -> None:
        def build() -> tuple[AccountUsageEvent, ...]:
            return self._events_for_pass_result(
                request,
                usage,
                event_type=AccountUsageEventType.PASS_SUCCEEDED,
                fetched_count=fetched_count,
                accepted_count=accepted_count,
            )

        self._append_safely(build)

    def complete_pass_failure(
        self,
        request: DailySearchRequest,
        usage: SearchPassUsage,
        *,
        failure_kind: str,
        reset_at: datetime | None = None,
    ) -> None:
        def build() -> tuple[AccountUsageEvent, ...]:
            return self._events_for_pass_result(
                request,
                usage,
                event_type=AccountUsageEventType.PASS_FAILED,
                failure_kind=failure_kind,
                reset_at=reset_at,
            )

        self._append_safely(build)

    def _events_for_pass_result(
        self,
        request: DailySearchRequest,
        usage: SearchPassUsage,
        *,
        event_type: AccountUsageEventType,
        fetched_count: int | None = None,
        accepted_count: int | None = None,
        failure_kind: str | None = None,
        reset_at: datetime | None = None,
    ) -> tuple[AccountUsageEvent, ...]:
        after_snapshot = self._snapshot_safely()
        deltas = account_usage_deltas(usage.before_snapshot, after_snapshot)
        # Shared pool counters can change in another gRPC request and do not
        # prove which account executed this pass.
        events = [
            self._event(
                request,
                event_type,
                usage=usage,
                fetched_count=fetched_count,
                accepted_count=accepted_count,
                failure_kind=failure_kind,
                reset_at=reset_at,
                attribution_status=AccountUsageAttributionStatus.UNKNOWN,
            ),
        ]

        for delta in deltas:
            if delta.cooldown_observed:
                events.append(
                    self._event_for_delta(
                        request,
                        usage,
                        delta,
                        event_type=AccountUsageEventType.COOLDOWN_OBSERVED,
                        failure_kind=failure_kind,
                        reset_at=delta.after.available_at or reset_at,
                    ),
                )

        return tuple(events)

    def _event_for_delta(
        self,
        request: DailySearchRequest,
        usage: SearchPassUsage,
        delta: AccountUsageDelta,
        *,
        event_type: AccountUsageEventType,
        fetched_count: int | None = None,
        accepted_count: int | None = None,
        failure_kind: str | None = None,
        reset_at: datetime | None = None,
        attribution_status: AccountUsageAttributionStatus | None = None,
    ) -> AccountUsageEvent:
        before = delta.before
        after = delta.after

        return self._event(
            request,
            event_type,
            account=after,
            usage=usage,
            estimated_request_cost=usage.estimated_request_cost,
            daily_requests_limit=after.daily_requests_limit,
            daily_tweets_limit=after.daily_tweets_limit,
            account_priority=after.priority,
            requests_before=before.daily_requests if before else None,
            requests_after=after.daily_requests,
            tweets_before=before.daily_tweets if before else None,
            tweets_after=after.daily_tweets,
            fetched_count=fetched_count,
            accepted_count=accepted_count,
            failure_kind=failure_kind,
            cooldown_reason=after.cooldown_reason,
            reset_at=reset_at or after.available_at,
            attribution_status=attribution_status,
        )

    def _event(
        self,
        request: DailySearchRequest,
        event_type: AccountUsageEventType,
        *,
        account: AccountCapacity | None = None,
        usage: SearchPassUsage | None = None,
        estimated_request_cost: int | None = None,
        daily_requests_limit: int | None = None,
        daily_tweets_limit: int | None = None,
        account_priority: int | None = None,
        requests_before: int | None = None,
        requests_after: int | None = None,
        tweets_before: int | None = None,
        tweets_after: int | None = None,
        fetched_count: int | None = None,
        accepted_count: int | None = None,
        failure_kind: str | None = None,
        cooldown_reason: str | None = None,
        reset_at: datetime | None = None,
        attribution_status: AccountUsageAttributionStatus | None = None,
    ) -> AccountUsageEvent:
        return AccountUsageEvent(
            event_id=self._event_id_factory(),
            event_type=event_type,
            provider=X_TWITTER_PROVIDER,
            occurred_at=self._clock.now(),
            account_id=account.account_id if account else None,
            username=account.username if account else None,
            request_id=request.request_id,
            scan_job_id=request.scan_job_id,
            source_binding_id=request.source_binding_id,
            query=request.query,
            pass_label=usage.pass_label if usage else None,
            product=usage.product if usage else None,
            estimated_request_cost=estimated_request_cost,
            daily_requests_limit=(
                daily_requests_limit
                if daily_requests_limit is not None
                else account.daily_requests_limit if account else None
            ),
            daily_tweets_limit=(
                daily_tweets_limit
                if daily_tweets_limit is not None
                else account.daily_tweets_limit if account else None
            ),
            account_priority=(
                account_priority
                if account_priority is not None
                else account.priority if account else None
            ),
            requests_before=requests_before,
            requests_after=requests_after,
            tweets_before=tweets_before,
            tweets_after=tweets_after,
            fetched_count=fetched_count,
            accepted_count=accepted_count,
            failure_kind=failure_kind,
            cooldown_reason=cooldown_reason,
            reset_at=reset_at,
            attribution_status=attribution_status,
        )

    def _append_safely(
        self,
        build_events: Callable[[], tuple[AccountUsageEvent, ...]],
    ) -> None:
        try:
            events = build_events()
            if events:
                self._repository.append_events(events)
        except Exception:
            return

    def _snapshot_safely(self) -> AccountPoolSnapshot | None:
        try:
            return self._snapshot()
        except Exception:
            return None

    def _snapshot(self) -> AccountPoolSnapshot | None:
        return self._ledger.snapshot(self._clock.now())
