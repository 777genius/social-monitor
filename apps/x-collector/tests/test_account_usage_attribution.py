from __future__ import annotations

import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from threading import Barrier, Lock
from typing import Callable

from x_collector.account_pool import (
    AccountCapacity,
    AccountPoolLimits,
    AccountPoolSnapshot,
)
from x_collector.account_usage import (
    AccountUsageAttributionStatus,
    AccountUsageDelta,
    AccountUsageEvent,
    AccountUsageEventType,
    account_usage_deltas,
)
from x_collector.account_usage_observer import (
    OVERLAPS_PASS_OBSERVATION_WINDOW,
    AccountUsageObserver,
)
from x_collector.domain import DailySearchRequest, SearchProduct
from x_collector.search_plan import ScweetSearchPass


@dataclass(frozen=True)
class FixedClock:
    value: datetime

    def now(self) -> datetime:
        return self.value


class SnapshotLedger:
    def __init__(
        self,
        snapshots: tuple[AccountPoolSnapshot | None, ...],
    ) -> None:
        self._snapshots = snapshots
        self._index = 0

    def snapshot(self, now: datetime) -> AccountPoolSnapshot | None:
        del now
        snapshot = self._snapshots[min(self._index, len(self._snapshots) - 1)]
        self._index += 1
        return snapshot


class CapturingRepository:
    def __init__(self) -> None:
        self.events: list[AccountUsageEvent] = []

    def append_events(self, events: tuple[AccountUsageEvent, ...]) -> None:
        self.events.extend(events)


class ConcurrentMutationLedger:
    def __init__(self, initial: AccountPoolSnapshot) -> None:
        self._current = initial
        self._lock = Lock()

    def snapshot(self, now: datetime) -> AccountPoolSnapshot:
        del now
        with self._lock:
            return self._current

    def replace(self, current: AccountPoolSnapshot) -> None:
        with self._lock:
            self._current = current


class CompletionSnapshotFailureLedger:
    def __init__(self, before: AccountPoolSnapshot) -> None:
        self._before = before
        self._snapshot_count = 0

    def snapshot(self, now: datetime) -> AccountPoolSnapshot:
        del now
        self._snapshot_count += 1
        if self._snapshot_count == 1:
            return self._before
        raise RuntimeError("completion snapshot unavailable")


class AccountUsageAttributionTest(unittest.TestCase):
    def test_success_persists_unknown_when_completion_snapshot_fails(
        self,
    ) -> None:
        before = snapshot(account(1))
        repository = CapturingRepository()
        observer = AccountUsageObserver(
            CompletionSnapshotFailureLedger(before),
            repository,
            FixedClock(before.observed_at),
            event_id_factory=event_id_factory(),
            pass_observation_id_factory=pass_observation_id_factory(),
        )
        usage = observer.begin_pass(request(), search_pass(), 1)

        observer.complete_pass_success(
            request(),
            usage,
            fetched_count=3,
            accepted_count=2,
        )

        results = [
            event
            for event in repository.events
            if event.event_type is AccountUsageEventType.PASS_SUCCEEDED
        ]
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].account_id)
        self.assertEqual(
            results[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(state_delta_events(repository.events), [])

    def test_failure_persists_unknown_when_completion_snapshot_fails(
        self,
    ) -> None:
        before = snapshot(account(1))
        repository = CapturingRepository()
        observer = AccountUsageObserver(
            CompletionSnapshotFailureLedger(before),
            repository,
            FixedClock(before.observed_at),
            event_id_factory=event_id_factory(),
            pass_observation_id_factory=pass_observation_id_factory(),
        )
        usage = observer.begin_pass(request(), search_pass(), 1)

        observer.complete_pass_failure(
            request(),
            usage,
            failure_kind="provider_error",
        )

        results = [
            event
            for event in repository.events
            if event.event_type is AccountUsageEventType.PASS_FAILED
        ]
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].account_id)
        self.assertEqual(
            results[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(state_delta_events(repository.events), [])

    def test_does_not_infer_known_from_unique_shared_counter_delta(self) -> None:
        before = snapshot(account(1), account(2))
        after = snapshot(
            replace(
                account(1),
                daily_requests=1,
                daily_tweets=3,
                remaining_requests=29,
                remaining_tweets=597,
            ),
            replace(account(2), busy=True),
        )

        events = observe_success_events(before, after)
        results = pass_result_events(events)
        state_deltas = state_delta_events(events)

        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].account_id)
        self.assertEqual(
            results[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(results[0].fetched_count, 3)
        self.assertEqual(len(state_deltas), 1)
        self.assertEqual(state_deltas[0].account_id, 1)
        self.assertEqual(state_deltas[0].requests_before, 0)
        self.assertEqual(state_deltas[0].requests_after, 1)
        self.assertEqual(state_deltas[0].tweets_before, 0)
        self.assertEqual(state_deltas[0].tweets_after, 3)
        self.assertIsNone(state_deltas[0].fetched_count)
        self.assertIsNone(state_deltas[0].accepted_count)
        self.assertEqual(
            state_deltas[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(
            state_deltas[0].observation_relation,
            OVERLAPS_PASS_OBSERVATION_WINDOW,
        )
        self.assertEqual(
            state_deltas[0].pass_observation_id,
            results[0].pass_observation_id,
        )

    def test_concurrent_unrelated_account_delta_remains_unknown(self) -> None:
        before = snapshot(account(1), account(2))
        ledger = ConcurrentMutationLedger(before)
        repository = CapturingRepository()
        observer = AccountUsageObserver(
            ledger,
            repository,
            FixedClock(before.observed_at),
            event_id_factory=event_id_factory(),
            pass_observation_id_factory=pass_observation_id_factory(),
        )
        usage = observer.begin_pass(request(), search_pass(), 1)
        mutation_barrier = Barrier(2)

        def mutate_unrelated_account() -> None:
            mutation_barrier.wait()
            ledger.replace(
                snapshot(
                    account(1),
                    replace(
                        account(2),
                        daily_requests=1,
                        daily_tweets=7,
                        remaining_requests=29,
                        remaining_tweets=593,
                    ),
                ),
            )

        with ThreadPoolExecutor(max_workers=1) as executor:
            unrelated_request = executor.submit(mutate_unrelated_account)
            mutation_barrier.wait()
            unrelated_request.result(timeout=1)

        observer.complete_pass_success(
            request(),
            usage,
            fetched_count=3,
            accepted_count=2,
        )
        results = [
            event
            for event in repository.events
            if event.event_type is AccountUsageEventType.PASS_SUCCEEDED
        ]

        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].account_id)
        self.assertEqual(
            results[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(results[0].fetched_count, 3)
        state_deltas = state_delta_events(repository.events)
        self.assertEqual(len(state_deltas), 1)
        self.assertEqual(state_deltas[0].account_id, 2)
        self.assertIsNone(state_deltas[0].fetched_count)
        self.assertEqual(
            state_deltas[0].observation_relation,
            OVERLAPS_PASS_OBSERVATION_WINDOW,
        )

    def test_uses_explicit_unknown_when_snapshot_has_no_identity_delta(
        self,
    ) -> None:
        unchanged = snapshot(account(1), account(2))

        events = observe_success_events(unchanged, unchanged)
        results = pass_result_events(events)

        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].account_id)
        self.assertEqual(
            results[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(results[0].accepted_count, 2)
        self.assertEqual(state_delta_events(events), [])

    def test_does_not_duplicate_result_when_multiple_accounts_have_usage(
        self,
    ) -> None:
        before = snapshot(account(1), account(2))
        after = snapshot(
            replace(
                account(1),
                daily_requests=1,
                daily_tweets=2,
                remaining_requests=29,
                remaining_tweets=598,
            ),
            replace(
                account(2),
                daily_requests=1,
                daily_tweets=1,
                remaining_requests=29,
                remaining_tweets=599,
            ),
        )

        events = observe_success_events(before, after)
        results = pass_result_events(events)
        state_deltas = state_delta_events(events)

        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].account_id)
        self.assertEqual(
            results[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(
            [event.account_id for event in state_deltas],
            [1, 2],
        )
        self.assertTrue(
            all(event.fetched_count is None for event in state_deltas),
        )
        self.assertEqual(
            {event.pass_observation_id for event in state_deltas},
            {results[0].pass_observation_id},
        )
        self.assertEqual(
            {event.observation_relation for event in state_deltas},
            {OVERLAPS_PASS_OBSERVATION_WINDOW},
        )

    def test_missing_baseline_does_not_treat_historical_counters_as_usage(
        self,
    ) -> None:
        after = snapshot(
            replace(
                account(1),
                daily_requests=24,
                daily_tweets=137,
                remaining_requests=6,
                remaining_tweets=463,
            ),
        )

        self.assertEqual(account_usage_deltas(None, after), ())
        delta = AccountUsageDelta(before=None, after=after.accounts[0])
        self.assertEqual(delta.request_delta, 0)
        self.assertEqual(delta.tweet_delta, 0)

        events = observe_success_events(None, after)
        results = pass_result_events(events)

        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].account_id)
        self.assertEqual(
            results[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(state_delta_events(events), [])

    def test_busy_only_change_does_not_select_known_attribution(self) -> None:
        before = snapshot(account(1), account(2))
        after = snapshot(account(1), replace(account(2), busy=True))

        events = observe_success_events(before, after)
        results = pass_result_events(events)

        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].account_id)
        self.assertEqual(
            results[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )
        self.assertEqual(state_delta_events(events), [])

    def test_cooldown_only_change_does_not_record_state_delta(
        self,
    ) -> None:
        before = snapshot(account(1))
        reset_at = datetime(2026, 7, 18, 0, 20, tzinfo=UTC)
        after = snapshot(
            replace(
                account(1),
                status=429,
                available_at=reset_at,
                cooldown_reason="rate_limit",
            ),
        )

        events = observe_success_events(before, after)
        cooldowns = [
            event
            for event in events
            if event.event_type is AccountUsageEventType.COOLDOWN_OBSERVED
        ]

        self.assertEqual(state_delta_events(events), [])
        self.assertEqual(len(cooldowns), 1)
        self.assertEqual(cooldowns[0].account_id, 1)
        self.assertEqual(cooldowns[0].cooldown_reason, "rate_limit")
        self.assertIsNone(cooldowns[0].requests_before)
        self.assertIsNone(cooldowns[0].requests_after)
        self.assertIsNone(cooldowns[0].tweets_before)
        self.assertIsNone(cooldowns[0].tweets_after)
        self.assertEqual(
            cooldowns[0].observation_relation,
            OVERLAPS_PASS_OBSERVATION_WINDOW,
        )
        self.assertEqual(
            cooldowns[0].attribution_status,
            AccountUsageAttributionStatus.UNKNOWN,
        )


def observe_success_events(
    before: AccountPoolSnapshot | None,
    after: AccountPoolSnapshot,
) -> list[AccountUsageEvent]:
    repository = CapturingRepository()
    observer = AccountUsageObserver(
        SnapshotLedger((before, after)),
        repository,
        FixedClock(after.observed_at),
        event_id_factory=event_id_factory(),
        pass_observation_id_factory=pass_observation_id_factory(),
    )
    usage = observer.begin_pass(request(), search_pass(), 1)
    observer.complete_pass_success(
        request(),
        usage,
        fetched_count=3,
        accepted_count=2,
    )

    return repository.events


def pass_result_events(
    events: list[AccountUsageEvent],
) -> list[AccountUsageEvent]:
    return [
        event
        for event in events
        if event.event_type is AccountUsageEventType.PASS_SUCCEEDED
    ]


def state_delta_events(
    events: list[AccountUsageEvent],
) -> list[AccountUsageEvent]:
    return [
        event
        for event in events
        if event.event_type is AccountUsageEventType.ACCOUNT_STATE_DELTA_OBSERVED
    ]


def snapshot(*accounts: AccountCapacity) -> AccountPoolSnapshot:
    return AccountPoolSnapshot(
        observed_at=datetime(2026, 7, 18, 0, 5, tzinfo=UTC),
        limits=AccountPoolLimits(daily_requests=30, daily_tweets=600),
        accounts=accounts,
    )


def account(account_id: int) -> AccountCapacity:
    return AccountCapacity(
        account_id=account_id,
        username=f"research-{account_id}",
        status=1,
        daily_requests=0,
        daily_tweets=0,
        daily_requests_limit=30,
        daily_tweets_limit=600,
        priority=account_id,
        remaining_requests=30,
        remaining_tweets=600,
        available_at=None,
        lease_id=None,
        lease_expires_at=None,
        busy=False,
        cooldown_reason=None,
    )


def request() -> DailySearchRequest:
    return DailySearchRequest(
        request_id="request-1",
        tenant_id="tenant-1",
        workspace_id="workspace-1",
        source_binding_id="binding-1",
        scan_job_id="scan-1",
        correlation_id="correlation-1",
        query="AI agents",
        language="en",
        window_hours=24,
        window_end=datetime(2026, 7, 18, tzinfo=UTC),
        search_products=(SearchProduct.TOP,),
        limit_per_product=10,
        max_items=5,
        min_likes=None,
        min_retweets=None,
        min_replies=None,
        cursor=None,
    )


def search_pass() -> ScweetSearchPass:
    return ScweetSearchPass(
        label="top_base",
        product=SearchProduct.TOP,
        limit=10,
        min_likes=None,
        min_retweets=None,
        min_replies=None,
    )


def event_id_factory() -> Callable[[], str]:
    next_id = 0

    def create() -> str:
        nonlocal next_id
        next_id += 1
        return f"event-{next_id}"

    return create


def pass_observation_id_factory() -> Callable[[], str]:
    next_id = 0

    def create() -> str:
        nonlocal next_id
        next_id += 1
        return f"pass-observation-{next_id}"

    return create


if __name__ == "__main__":
    unittest.main()
