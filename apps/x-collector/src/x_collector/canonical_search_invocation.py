from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Callable

from . import __version__
from .candidate_rejection_cache import (
    CandidateRejectionCacheError, CandidateRejectionScope, candidate_rejection_scope,
)
from .domain import (
    DailySearchRequest, DailySearchResult, XCollectedPost, XCollectorRun,
    XCollectorWarning, XCollectorRateLimitError, XCollectorUnavailableError,
)
from .scoring import CandidateSignal, aggregate_candidates, rank_candidates
from .search_budget import retry_after_ms_until, warnings_for_budget_decision
from .search_plan import plan_scweet_search_passes
from .canonical_search_services import (
    CanonicalSearchServices, CanonicalSearchObserver, PassRecord, ChosenOrigin,
    CacheObservation, CanonicalObservationError,
)


class CanonicalInvocation:
    """One ordinary invocation; external execution and storage remain injected."""

    def __init__(self, services: CanonicalSearchServices,
                 observer: CanonicalSearchObserver | None = None) -> None:
        self.services = services
        self.observer = observer

    def _observe_cache(self, observation: CacheObservation) -> None:
        if self.observer is not None:
            self._notify(self.observer.on_cache_observation, observation)

    def _notify(self, callback: Callable[..., None], *facts: object) -> None:
        try:
            callback(*(deepcopy(fact) for fact in facts))
        except Exception as exc:
            raise CanonicalObservationError("Canonical observation failed") from exc

    @staticmethod
    def _observed_rejections(rejections):
        try:
            return tuple(rejections.items())
        except Exception as exc:
            raise CanonicalObservationError("Cache observation snapshot failed") from exc

    def run(
        self,
        request: DailySearchRequest,
    ) -> DailySearchResult:
        started_at = self.services.clock.now()
        scweet = self.services.start_execution()
        self.services.prepare_account_pool()
        since, until = self.services.date_window(request)
        fetched_posts: list[tuple[XCollectedPost, CandidateSignal]] = []
        warnings: list[XCollectorWarning] = []
        if request.cursor:
            warnings.append(
                XCollectorWarning(
                    code="x_collector.cursor_ignored",
                    message=(
                        "Daily multi-pass search ignores external cursor; "
                        "dedupe is handled by the Social Monitor store."
                    ),
                ),
            )

        planned_passes = plan_scweet_search_passes(request)
        budget = self.services.budget_search_passes(planned_passes)
        self.services.account_usage_observer.record_budget_decision(request, budget)
        warnings.extend(warnings_for_budget_decision(budget))
        if not budget.passes and budget.remaining_request_budget is not None:
            raise XCollectorRateLimitError(
                "Scweet account pool budget exhausted",
                retry_after_ms=retry_after_ms_until(
                    self.services.clock.now(),
                    budget.reset_at,
                ),
                reset_at=budget.reset_at,
            )

        for search_pass in budget.passes:
            self.services.prepare_account_pool()
            try:
                records, scweet, usage, failover_count = (
                    self.services.execute_pass(
                        scweet,
                        request=request,
                        search_pass=search_pass,
                        since=since,
                        until=until,
                    )
                )
            except Exception as classified:
                warning = partial_warning_for_late_failure(
                    classified,
                    search_pass.label,
                    len(fetched_posts),
                )
                if warning is not None:
                    warnings.append(warning)
                    break

                raise classified

            if failover_count > 0:
                warnings.append(
                    XCollectorWarning(
                        code="x_collector.account_failover",
                        message=(
                            f"{search_pass.label} resumed with another account "
                            f"after {failover_count} account-scoped failure(s)"
                        ),
                    ),
                )

            observed_records: list[PassRecord] = []
            accepted_count = 0
            for rank, record in enumerate(records, start=1):
                post = self.services.normalize_record(record, search_pass.product)
                in_window = post is not None and self.services.in_window(post, request)
                if self.observer is not None:
                    observed_records.append(PassRecord(rank, post, in_window))
                if post is not None and in_window:
                    fetched_posts.append((
                        post,
                        CandidateSignal(
                            pass_label=search_pass.label,
                            product=search_pass.product,
                            rank=rank,
                        ),
                    ))
                    accepted_count += 1

            if self.observer is not None:
                self._notify(self.observer.on_pass_records,
                    search_pass, tuple(observed_records),
                )

            self.services.account_usage_observer.complete_pass_success(
                request,
                usage,
                fetched_count=len(records),
                accepted_count=accepted_count,
            )
            if len(records) < search_pass.limit:
                warnings.append(
                    XCollectorWarning(
                        code="x_collector.partial_pass",
                        message=(
                            f"{search_pass.label} returned fewer records "
                            "than requested"
                        ),
                    ),
                )
            if records and accepted_count == 0:
                warnings.append(
                    XCollectorWarning(
                        code="x_collector.pass_filtered",
                        message=(
                            f"{search_pass.label} returned records, but all "
                            "were outside the requested window or invalid"
                        ),
                    ),
                )
            if self.services.account_budget_is_depleted():
                warnings.append(
                    XCollectorWarning(
                        code="x_collector.account_budget_depleted",
                        message=(
                            "Scweet account pool budget was depleted after "
                            f"{search_pass.label}; returning partial daily "
                            "search results"
                        ),
                    ),
                )
                break

        ranking_posts, rejection_scope, rejection_cache_ready = (
            self._filter_cached_rank_rejections(
                request,
                fetched_posts,
                started_at,
                warnings,
            )
        )
        selected_posts = rank_candidates(
            ranking_posts,
            query=request.query,
            window_end=request.window_end,
            max_items=request.max_items,
        )
        completed_at = self.services.clock.now()
        if rejection_cache_ready and rejection_scope is not None:
            self._record_ranking_outcomes(
                rejection_scope,
                ranking_posts,
                selected_posts,
                completed_at,
                warnings,
            )

        result = DailySearchResult(
            posts=tuple(selected_posts),
            next_cursor=None,
            warnings=tuple(warnings),
            run=XCollectorRun(
                collector_engine="scweet",
                collector_version=f"scweet-5.3 service-{__version__}",
                started_at=started_at,
                completed_at=completed_at,
                requested_limit=request.max_items,
                fetched_count=len(fetched_posts),
                returned_count=len(selected_posts),
                partial=len(selected_posts) < request.max_items,
            ),
        )

        if self.observer is not None:
            origins = []
            by_id = {c.post.tweet_id: c for c in aggregate_candidates(ranking_posts)}
            for selected in selected_posts:
                candidate = by_id[selected.tweet_id]
                origin = next(signal for post, signal in ranking_posts
                              if post is candidate.post)
                origins.append(ChosenOrigin(selected.tweet_id, origin, candidate.signals))
            self._notify(self.observer.on_invocation_return, result, tuple(origins))
        return result

    def _filter_cached_rank_rejections(
        self,
        request: DailySearchRequest,
        fetched_posts: list[tuple[XCollectedPost, CandidateSignal]],
        now: datetime,
        warnings: list[XCollectorWarning],
    ) -> tuple[
        list[tuple[XCollectedPost, CandidateSignal]],
        CandidateRejectionScope | None,
        bool,
    ]:
        repository = self.services.rejection_repository
        if repository is None or not fetched_posts:
            self._observe_cache(CacheObservation(
                "bypass", "not_configured" if repository is None else "empty_pool",
            ))
            return fetched_posts, None, False

        scope = candidate_rejection_scope(request)
        unique_candidates = aggregate_candidates(fetched_posts)
        operation = "load"
        observed_ids = tuple(candidate.post.tweet_id for candidate in unique_candidates)
        try:
            rejections = repository.load_rejections(
                scope,
                tuple(candidate.post.tweet_id for candidate in unique_candidates),
            )
            if self.observer is not None:
                self._observe_cache(CacheObservation(
                    "load", "success", scope, observed_ids,
                    rejections=self._observed_rejections(rejections),
                ))
            suppressed_ids = tuple(
                candidate.post.tweet_id
                for candidate in unique_candidates
                if (
                    (rejection := rejections.get(candidate.post.tweet_id))
                    is not None
                    and self.services.rejection_policy.should_suppress(
                        rejection,
                        candidate.post,
                        request,
                        now,
                    )
                )
            )
            maximum_suppressed_count = max(
                0,
                len(unique_candidates) - request.max_items,
            )
            suppressed_ids = suppressed_ids[:maximum_suppressed_count]
            operation = "mark_seen"
            observed_ids = suppressed_ids
            repository.mark_seen(scope, suppressed_ids, now)
        except CandidateRejectionCacheError:
            append_rejection_cache_warning(warnings)
            self._observe_cache(CacheObservation(
                operation, "unavailable", scope, observed_ids,
                at=now if operation == "mark_seen" else None,
            ))
            return fetched_posts, scope, False

        self._observe_cache(CacheObservation(
            "mark_seen", "success", scope, suppressed_ids, at=now,
        ))
        suppressed = set(suppressed_ids)
        return (
            [item for item in fetched_posts if item[0].tweet_id not in suppressed],
            scope,
            True,
        )

    def _record_ranking_outcomes(
        self,
        scope: CandidateRejectionScope,
        ranking_posts: list[tuple[XCollectedPost, CandidateSignal]],
        selected_posts: list[XCollectedPost],
        now: datetime,
        warnings: list[XCollectorWarning],
    ) -> None:
        repository = self.services.rejection_repository
        if repository is None:
            return

        selected_ids = tuple(post.tweet_id for post in selected_posts)
        selected_id_set = set(selected_ids)
        rejected_posts = tuple(
            candidate.post
            for candidate in aggregate_candidates(ranking_posts)
            if candidate.post.tweet_id not in selected_id_set
        )
        rejections = ()
        try:
            rejections = tuple(
                self.services.rejection_policy.new_rejection(post, now)
                for post in rejected_posts
            )
            repository.record_outcomes(
                scope,
                selected_ids,
                rejections,
                now,
            )
        except CandidateRejectionCacheError:
            append_rejection_cache_warning(warnings)
            self._observe_cache(CacheObservation("record_outcomes", "unavailable", scope,
                                                 selected_ids, at=now, outcomes=rejections))
            return
        self._observe_cache(CacheObservation("record_outcomes", "success", scope,
                                             selected_ids, at=now, outcomes=rejections))


def append_rejection_cache_warning(
    warnings: list[XCollectorWarning],
) -> None:
    if any(
        warning.code == "x_collector.rejection_cache_unavailable"
        for warning in warnings
    ):
        return
    warnings.append(
        XCollectorWarning(
            code="x_collector.rejection_cache_unavailable",
            message=(
                "The derived candidate rejection cache was unavailable; "
                "collection continued without cached suppression"
            ),
        ),
    )


def partial_warning_for_late_failure(
    failure: Exception,
    pass_label: str,
    fetched_count: int,
) -> XCollectorWarning | None:
    if fetched_count <= 0:
        return None

    if isinstance(failure, XCollectorRateLimitError):
        return XCollectorWarning(
            code="x_collector.partial_rate_limit",
            message=(
                f"{pass_label} hit a rate limit after earlier passes returned "
                "posts; returning partial daily search results"
            ),
        )

    if isinstance(failure, XCollectorUnavailableError):
        return XCollectorWarning(
            code="x_collector.partial_provider_failure",
            message=(
                f"{pass_label} hit a transient provider failure after earlier "
                "passes returned posts; returning partial daily search results"
            ),
        )

    return None
