from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from .account_pool import AccountCapacity, AccountPoolSnapshot


class AccountUsageEventType(str, Enum):
    BUDGET_SNAPSHOT = "budget_snapshot"
    PASS_STARTED = "pass_started"
    PASS_SUCCEEDED = "pass_succeeded"
    PASS_FAILED = "pass_failed"
    COOLDOWN_OBSERVED = "cooldown_observed"


class AccountUsageAttributionStatus(str, Enum):
    KNOWN = "known"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class AccountUsageEvent:
    event_id: str
    event_type: AccountUsageEventType
    provider: str
    occurred_at: datetime
    account_id: int | None
    username: str | None
    request_id: str
    scan_job_id: str
    source_binding_id: str
    query: str
    pass_label: str | None = None
    product: str | None = None
    estimated_request_cost: int | None = None
    daily_requests_limit: int | None = None
    daily_tweets_limit: int | None = None
    account_priority: int | None = None
    requests_before: int | None = None
    requests_after: int | None = None
    tweets_before: int | None = None
    tweets_after: int | None = None
    fetched_count: int | None = None
    accepted_count: int | None = None
    returned_count: int | None = None
    failure_kind: str | None = None
    cooldown_reason: str | None = None
    reset_at: datetime | None = None
    attribution_status: AccountUsageAttributionStatus | None = None


@dataclass(frozen=True)
class AccountUsageDelta:
    before: AccountCapacity | None
    after: AccountCapacity

    @property
    def request_delta(self) -> int:
        if self.before is None:
            return 0

        return max(
            self.after.daily_requests - self.before.daily_requests,
            0,
        )

    @property
    def tweet_delta(self) -> int:
        if self.before is None:
            return 0

        return max(
            self.after.daily_tweets - self.before.daily_tweets,
            0,
        )

    @property
    def cooldown_observed(self) -> bool:
        return (
            self.after.cooldown_reason is not None
            or self.after.available_at is not None
        )


@dataclass(frozen=True)
class SearchPassUsage:
    request_id: str
    scan_job_id: str
    pass_label: str
    product: str
    estimated_request_cost: int
    before_snapshot: AccountPoolSnapshot | None


def account_usage_deltas(
    before: AccountPoolSnapshot | None,
    after: AccountPoolSnapshot | None,
) -> tuple[AccountUsageDelta, ...]:
    if before is None or after is None:
        return ()

    before_by_id = {
        account.account_id: account
        for account in before.accounts
    }

    deltas: list[AccountUsageDelta] = []
    for after_account in after.accounts:
        before_account = before_by_id.get(after_account.account_id)
        if before_account is None or account_capacity_changed(
            before_account,
            after_account,
        ):
            deltas.append(
                AccountUsageDelta(before=before_account, after=after_account),
            )

    return tuple(deltas)


def account_capacity_changed(
    before: AccountCapacity,
    after: AccountCapacity,
) -> bool:
    return (
        before.daily_requests != after.daily_requests
        or before.daily_tweets != after.daily_tweets
        or before.available_at != after.available_at
        or before.lease_id != after.lease_id
        or before.lease_expires_at != after.lease_expires_at
        or before.busy != after.busy
        or before.cooldown_reason != after.cooldown_reason
        or before.status != after.status
    )
