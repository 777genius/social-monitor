from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .account_pool import AccountPoolSnapshot
from .domain import XCollectorWarning
from .search_plan import ScweetSearchPass


@dataclass(frozen=True)
class SearchBudgetDecision:
    passes: tuple[ScweetSearchPass, ...]
    planned_pass_count: int
    estimated_request_cost: int
    remaining_request_budget: int | None
    total_accounts: int | None
    eligible_accounts: int | None
    reset_at: datetime | None

    @property
    def skipped_pass_count(self) -> int:
        return max(self.planned_pass_count - len(self.passes), 0)


def budget_search_passes(
    passes: tuple[ScweetSearchPass, ...],
    *,
    snapshot: AccountPoolSnapshot | None,
    api_page_size: int,
    n_splits: int,
) -> SearchBudgetDecision:
    if snapshot is None:
        return SearchBudgetDecision(
            passes=passes,
            planned_pass_count=len(passes),
            estimated_request_cost=sum(
                estimate_pass_request_cost(
                    search_pass,
                    api_page_size=api_page_size,
                    n_splits=n_splits,
                )
                for search_pass in passes
            ),
            remaining_request_budget=None,
            total_accounts=None,
            eligible_accounts=None,
            reset_at=None,
        )

    remaining_budget = snapshot.total_remaining_requests
    selected: list[ScweetSearchPass] = []
    estimated_cost = 0

    for search_pass in passes:
        cost = estimate_pass_request_cost(
            search_pass,
            api_page_size=api_page_size,
            n_splits=n_splits,
        )
        if estimated_cost + cost > remaining_budget:
            continue

        selected.append(search_pass)
        estimated_cost += cost

    return SearchBudgetDecision(
        passes=tuple(selected),
        planned_pass_count=len(passes),
        estimated_request_cost=estimated_cost,
        remaining_request_budget=remaining_budget,
        total_accounts=snapshot.total_accounts,
        eligible_accounts=len(snapshot.eligible_accounts),
        reset_at=snapshot.next_capacity_reset_at(),
    )


def warnings_for_budget_decision(
    decision: SearchBudgetDecision,
) -> list[XCollectorWarning]:
    warnings: list[XCollectorWarning] = []
    if decision.remaining_request_budget is None:
        return warnings

    if decision.skipped_pass_count > 0:
        warnings.append(
            XCollectorWarning(
                code="x_collector.account_budget_limited",
                message=(
                    "Scweet account pool budget allowed "
                    f"{len(decision.passes)} of {decision.planned_pass_count} "
                    "planned passes; estimated remaining requests="
                    f"{decision.remaining_request_budget}; eligible accounts="
                    f"{decision.eligible_accounts}/{decision.total_accounts}"
                ),
            ),
        )

    return warnings


def retry_after_ms_until(
    now: datetime,
    reset_at: datetime | None,
) -> int | None:
    if reset_at is None:
        return None

    return max(1, int((reset_at - now).total_seconds() * 1000))


def estimate_pass_request_cost(
    search_pass: ScweetSearchPass,
    *,
    api_page_size: int,
    n_splits: int,
) -> int:
    page_size = max(api_page_size, 1)
    split_count = max(n_splits, 1)
    requested_pages = max((search_pass.limit + page_size - 1) // page_size, 1)

    return split_count + requested_pages
