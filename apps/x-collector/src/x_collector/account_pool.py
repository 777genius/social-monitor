from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


ACTIVE_ACCOUNT_STATUS = 1
DEFAULT_REUSABLE_ACCOUNT_STATUSES = (ACTIVE_ACCOUNT_STATUS,)


@dataclass(frozen=True)
class AccountPoolLimits:
    daily_requests: int
    daily_tweets: int
    reusable_statuses: tuple[int, ...] = DEFAULT_REUSABLE_ACCOUNT_STATUSES


@dataclass(frozen=True)
class AccountCapacity:
    account_id: int
    username: str
    status: int
    daily_requests: int
    daily_tweets: int
    remaining_requests: int
    remaining_tweets: int
    available_at: datetime | None
    lease_id: str | None
    lease_expires_at: datetime | None
    busy: bool
    cooldown_reason: str | None

    def can_collect(
        self,
        now: datetime,
        reusable_statuses: tuple[int, ...] = DEFAULT_REUSABLE_ACCOUNT_STATUSES,
    ) -> bool:
        if self.status not in reusable_statuses:
            return False
        if self.remaining_requests <= 0 or self.remaining_tweets <= 0:
            return False
        if self.available_at is not None and self.available_at > now:
            return False
        if self.lease_id and (
            self.lease_expires_at is None or self.lease_expires_at > now
        ):
            return False

        return True


@dataclass(frozen=True)
class AccountPoolSnapshot:
    observed_at: datetime
    limits: AccountPoolLimits
    accounts: tuple[AccountCapacity, ...]

    @property
    def total_accounts(self) -> int:
        return len(self.accounts)

    @property
    def eligible_accounts(self) -> tuple[AccountCapacity, ...]:
        return tuple(
            account
            for account in self.accounts
            if account.can_collect(
                self.observed_at,
                reusable_statuses=self.limits.reusable_statuses,
            )
        )

    @property
    def total_remaining_requests(self) -> int:
        return sum(account.remaining_requests for account in self.eligible_accounts)

    @property
    def total_remaining_tweets(self) -> int:
        return sum(account.remaining_tweets for account in self.eligible_accounts)

    def next_capacity_reset_at(self) -> datetime:
        available_times = tuple(
            value
            for account in self.accounts
            for value in (
                account.available_at,
                account.lease_expires_at if account.lease_id else None,
            )
            if value is not None and value > self.observed_at
        )
        if available_times:
            return min(available_times)

        tomorrow = self.observed_at.astimezone(UTC).date() + timedelta(days=1)
        return datetime(tomorrow.year, tomorrow.month, tomorrow.day, tzinfo=UTC)
