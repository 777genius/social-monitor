from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any, Callable, Mapping

from .canonical_search_invocation import CanonicalInvocation
from .canonical_search_services import CanonicalSearchServices, CanonicalSearchObserver
from .account_pool import AccountLimitOverride, AccountPoolLimits
from .account_limit_profiles import AccountLimitProfile, load_account_limit_profiles
from .adaptive_account_limits import (
    AdaptiveAccountLimitPolicy,
    adapt_account_pool_limits,
    read_sqlite_account_limit_observations,
)
from .account_usage_observer import (
    AccountUsageObserver,
    NoopAccountUsageObserver,
)
from .account_usage import SearchPassUsage
from .candidate_rejection_cache import (
    CandidateRejectionPolicy,
)
from .config import XCollectorSettings
from .domain import (
    DailySearchRequest,
    DailySearchResult,
    SearchProduct,
    XCollectedPost,
    XCollectorAuthError,
    XCollectorInvalidRequestError,
    XCollectorRateLimitError,
    XCollectorUnavailableError,
    XPostMetrics,
    XPostContentKind,
    XEligibilityMetricsState,
)
from .ports import (
    AccountPoolLedgerPort,
    AccountUsageObserverPort,
    CandidateRejectionRepositoryPort,
    Clock,
    DailySearchCollectorPort,
)
from .search_budget import (
    SearchBudgetDecision,
    budget_search_passes,
    estimate_pass_request_cost,
)
from .scweet_account_pool_ledger import (
    SCWEET_REUSABLE_ACCOUNT_STATUSES,
    ScweetAccountPoolLedger,
)
from .scweet_errors import classify_scweet_error
from .scweet_run_maintenance import reconcile_stale_scweet_runs
from .scweet_run_identity import ScweetRunIdentityTracker
from .search_plan import ScweetSearchPass
from .sqlite_account_usage_event_repository import (
    SqliteAccountUsageEventRepository,
)
from .sqlite_candidate_rejection_repository import (
    SqliteCandidateRejectionRepository,
)


ScweetFactory = Callable[[], Any]
MAX_ACCOUNT_FAILOVERS_PER_PASS = 2
LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


def scweet_runtime_limits(
    *,
    default_daily_requests: int,
    default_daily_tweets: int,
    account_limit_profiles: Mapping[str, AccountLimitProfile],
) -> AccountLimitOverride:
    return AccountLimitOverride(
        daily_requests=max(
            (
                default_daily_requests,
                *(profile.daily_requests for profile in account_limit_profiles.values()),
            ),
        ),
        daily_tweets=max(
            (
                default_daily_tweets,
                *(profile.daily_tweets for profile in account_limit_profiles.values()),
            ),
        ),
        priority=100,
    )


def build_account_pool_limits(
    *,
    settings: XCollectorSettings,
    account_limit_profiles: Mapping[str, AccountLimitProfile],
) -> AccountPoolLimits:
    return AccountPoolLimits(
        daily_requests=settings.scweet_daily_requests_limit,
        daily_tweets=settings.scweet_daily_tweets_limit,
        per_account={
            username: AccountLimitOverride(
                daily_requests=profile.daily_requests,
                daily_tweets=profile.daily_tweets,
                priority=profile.priority,
            )
            for username, profile in account_limit_profiles.items()
        },
        reusable_statuses=SCWEET_REUSABLE_ACCOUNT_STATUSES,
    )


def runtime_limits_from_account_pool(
    limits: AccountPoolLimits,
) -> AccountLimitOverride:
    per_account = limits.per_account or {}

    return AccountLimitOverride(
        daily_requests=max(
            (
                limits.daily_requests,
                *(limit.daily_requests for limit in per_account.values()),
            ),
        ),
        daily_tweets=max(
            (
                limits.daily_tweets,
                *(limit.daily_tweets for limit in per_account.values()),
            ),
        ),
        priority=100,
    )


class ScweetDailySearchCollector(DailySearchCollectorPort):
    def __init__(
        self,
        scweet_factory: ScweetFactory,
        clock: Clock | None = None,
        scweet_db_path: str | None = None,
        account_pool_ledger: AccountPoolLedgerPort | None = None,
        scweet_api_page_size: int = 20,
        scweet_n_splits: int = 5,
        account_usage_observer: AccountUsageObserverPort | None = None,
        candidate_rejection_repository: CandidateRejectionRepositoryPort | None = None,
        candidate_rejection_policy: CandidateRejectionPolicy | None = None,
    ) -> None:
        self._scweet_factory = scweet_factory
        self._clock = clock or SystemClock()
        self._scweet_db_path = scweet_db_path
        self._account_pool_ledger = account_pool_ledger
        self._scweet_api_page_size = scweet_api_page_size
        self._scweet_n_splits = scweet_n_splits
        self._account_usage_observer = (
            account_usage_observer or NoopAccountUsageObserver()
        )
        self._candidate_rejection_repository = candidate_rejection_repository
        self._candidate_rejection_policy = (
            candidate_rejection_policy or CandidateRejectionPolicy()
        )

    @classmethod
    def from_settings(
        cls,
        settings: XCollectorSettings,
        clock: Clock | None = None,
    ) -> "ScweetDailySearchCollector":
        settings.ensure_runtime_paths()
        collector_clock = clock or SystemClock()
        account_limit_profiles = load_account_limit_profiles(
            inline_json=settings.scweet_account_limits_json,
            file_path=settings.scweet_account_limits_file,
        )
        account_pool_limits = build_account_pool_limits(
            settings=settings,
            account_limit_profiles=account_limit_profiles,
        )
        effective_account_pool_limits = adapt_account_pool_limits(
            account_pool_limits,
            read_sqlite_account_limit_observations(
                settings.scweet_db_path,
                collector_clock.now(),
            ),
            AdaptiveAccountLimitPolicy(
                enabled=settings.scweet_adaptive_budget_enabled,
            ),
        )
        runtime_limits = runtime_limits_from_account_pool(
            effective_account_pool_limits,
        )

        def reconcile_runs() -> None:
            reconciled = reconcile_stale_scweet_runs(
                settings.scweet_db_path,
                collector_clock.now(),
            )
            if reconciled > 0:
                LOGGER.warning("Reconciled %s stale Scweet run(s)", reconciled)

        reconcile_runs()

        def create_scweet() -> Any:
            from Scweet import Scweet, ScweetConfig

            reconcile_runs()

            config = ScweetConfig(
                daily_requests_limit=runtime_limits.daily_requests,
                daily_tweets_limit=runtime_limits.daily_tweets,
                requests_per_min=settings.scweet_requests_per_minute,
                min_delay_s=settings.scweet_min_delay_seconds,
                n_splits=settings.scweet_n_splits,
                api_page_size=settings.scweet_api_page_size,
                max_empty_pages=settings.scweet_max_empty_pages,
            )
            return Scweet(
                cookies_file=settings.scweet_cookies_file,
                auth_token=settings.scweet_auth_token,
                db_path=settings.scweet_db_path,
                proxy=settings.scweet_proxy,
                manifest_scrape_on_init=(
                    settings.scweet_manifest_scrape_on_init
                ),
                config=config,
                provision=True,
            )

        shared_account_pool_ledger = (
            ScweetAccountPoolLedger(
                settings.scweet_db_path,
                effective_account_pool_limits,
            )
            if (
                settings.scweet_budget_guard_enabled
                or settings.account_observability_enabled
            )
            else None
        )
        budget_account_pool_ledger = (
            shared_account_pool_ledger
            if settings.scweet_budget_guard_enabled
            else None
        )
        account_usage_observer = (
            AccountUsageObserver(
                shared_account_pool_ledger,
                SqliteAccountUsageEventRepository(settings.scweet_db_path),
                collector_clock,
            )
            if (
                settings.account_observability_enabled
                and shared_account_pool_ledger is not None
            )
            else NoopAccountUsageObserver()
        )

        return cls(
            create_scweet,
            collector_clock,
            settings.scweet_db_path,
            budget_account_pool_ledger,
            settings.scweet_api_page_size,
            settings.scweet_n_splits,
            account_usage_observer,
            candidate_rejection_repository=SqliteCandidateRejectionRepository(
                settings.scweet_db_path,
            ),
        )

    def collect_daily_search(
        self,
        request: DailySearchRequest,
        observer: CanonicalSearchObserver | None = None,
    ) -> DailySearchResult:
        return CanonicalInvocation(CanonicalSearchServices(
            clock=self._clock,
            start_execution=self._scweet_factory,
            prepare_account_pool=self._prepare_account_pool,
            date_window=scweet_date_window,
            budget_search_passes=self._budget_search_passes,
            account_usage_observer=self._account_usage_observer,
            execute_pass=self._run_pass_with_failover,
            normalize_record=post_from_scweet_record,
            in_window=post_is_in_window,
            account_budget_is_depleted=self._account_budget_is_depleted,
            rejection_repository=self._candidate_rejection_repository,
            rejection_policy=self._candidate_rejection_policy,
        ), observer).run(request)

    def _run_pass_with_failover(
        self,
        scweet: Any,
        *,
        request: DailySearchRequest,
        search_pass: ScweetSearchPass,
        since: str,
        until: str,
    ) -> tuple[list[Mapping[str, Any]], Any, SearchPassUsage, int]:
        estimated_cost = estimate_pass_request_cost(
            search_pass,
            api_page_size=self._scweet_api_page_size,
            n_splits=self._scweet_n_splits,
        )
        failover_count = 0

        while True:
            usage = self._account_usage_observer.begin_pass(
                request,
                search_pass,
                estimated_cost,
            )
            run_identity = ScweetRunIdentityTracker(self._scweet_db_path)
            try:
                with run_identity:
                    records = run_scweet_search_pass(
                        scweet,
                        request=request,
                        search_pass=search_pass,
                        since=since,
                        until=until,
                    )
                usage = replace(
                    usage,
                    collector_run_id=run_identity.collector_run_id,
                )
                return records, scweet, usage, failover_count
            except Exception as exc:
                usage = replace(
                    usage,
                    collector_run_id=run_identity.collector_run_id,
                )
                classified = classify_scweet_error(
                    exc,
                    clock=self._clock,
                    scweet_db_path=self._scweet_db_path,
                )
                self._account_usage_observer.complete_pass_failure(
                    request,
                    usage,
                    failure_kind=collector_failure_kind(classified),
                    reset_at=collector_failure_reset_at(classified),
                )
                if not self._can_failover_account(
                    classified,
                    estimated_cost=estimated_cost,
                    failover_count=failover_count,
                ):
                    raise classified from exc

                failover_count += 1
                scweet = self._scweet_factory()

    def _can_failover_account(
        self,
        failure: Exception,
        *,
        estimated_cost: int,
        failover_count: int,
    ) -> bool:
        if (
            self._account_pool_ledger is None
            or failover_count >= MAX_ACCOUNT_FAILOVERS_PER_PASS
            or not isinstance(failure, (XCollectorRateLimitError, XCollectorAuthError))
        ):
            return False

        self._prepare_account_pool()
        snapshot = self._account_pool_ledger.snapshot(self._clock.now())
        return (
            snapshot is not None
            and len(snapshot.eligible_accounts) > 0
            and snapshot.total_remaining_requests >= estimated_cost
        )

    def _budget_search_passes(
        self,
        planned_passes: tuple[ScweetSearchPass, ...],
    ) -> SearchBudgetDecision:
        snapshot = (
            self._account_pool_ledger.snapshot(self._clock.now())
            if self._account_pool_ledger is not None
            else None
        )

        return budget_search_passes(
            planned_passes,
            snapshot=snapshot,
            api_page_size=self._scweet_api_page_size,
            n_splits=self._scweet_n_splits,
        )

    def _account_budget_is_depleted(self) -> bool:
        if self._account_pool_ledger is None:
            return False
        snapshot = self._account_pool_ledger.snapshot(self._clock.now())

        return snapshot is not None and snapshot.total_remaining_requests <= 0

    def _prepare_account_pool(self) -> None:
        if self._account_pool_ledger is None:
            return

        now = self._clock.now()
        self._account_pool_ledger.apply_profile_cooldowns(now)
        self._account_pool_ledger.apply_collection_priorities(now)


def collector_failure_kind(failure: Exception) -> str:
    if isinstance(failure, XCollectorRateLimitError):
        return "rate_limited"
    if isinstance(failure, XCollectorAuthError):
        return "auth_failed"
    if isinstance(failure, XCollectorInvalidRequestError):
        return "invalid_request"
    if isinstance(failure, XCollectorUnavailableError):
        return "unavailable"
    return "unknown"


def collector_failure_reset_at(failure: Exception) -> datetime | None:
    if isinstance(failure, XCollectorRateLimitError):
        return failure.reset_at
    return None


def run_scweet_search_pass(
    scweet: Any,
    *,
    request: DailySearchRequest,
    search_pass: ScweetSearchPass,
    since: str,
    until: str,
) -> list[Mapping[str, Any]]:
    records = scweet.search(
        request.query,
        since=since,
        until=until,
        lang=request.language,
        tweet_type="originals_only",
        display_type=scweet_display_type(search_pass.product),
        limit=search_pass.limit,
        min_likes=search_pass.min_likes,
        min_retweets=search_pass.min_retweets,
        min_replies=search_pass.min_replies,
        save=False,
        resume=False,
    )
    if not isinstance(records, list):
        return []

    return [record for record in records if isinstance(record, Mapping)]


def scweet_date_window(request: DailySearchRequest) -> tuple[str, str]:
    window_end = request.window_end.astimezone(UTC)
    window_start = window_end - timedelta(hours=request.window_hours)
    # Scweet expands `until` to 23:59:59 of the supplied date, so it is an
    # inclusive calendar-day boundary rather than Twitter's exclusive `until`.
    # A midnight window end therefore belongs to the preceding UTC day.
    end_is_midnight = (
        window_end.hour == 0
        and window_end.minute == 0
        and window_end.second == 0
        and window_end.microsecond == 0
    )
    until_date = (
        window_end.date() - timedelta(days=1)
        if end_is_midnight
        else window_end.date()
    ).isoformat()

    return window_start.date().isoformat(), until_date


def scweet_display_type(product: SearchProduct) -> str:
    match product:
        case SearchProduct.TOP:
            return "Top"
        case SearchProduct.LATEST:
            return "Latest"


def post_from_scweet_record(
    record: Mapping[str, Any],
    product: SearchProduct,
) -> XCollectedPost | None:
    tweet_id = read_string(record.get("tweet_id"))
    text = read_string(record.get("text"))
    published_at = parse_scweet_timestamp(record.get("timestamp"))
    user = read_mapping(record.get("user"))
    author_handle = read_string(user.get("screen_name"))
    author_name = read_string(user.get("name"))

    if tweet_id is None or text is None or published_at is None:
        return None

    canonical_url = read_string(record.get("tweet_url"))
    if canonical_url is None and author_handle is not None:
        canonical_url = f"https://x.com/{author_handle}/status/{tweet_id}"

    if canonical_url is None:
        return None

    likes_raw = record.get("likes")
    retweets_raw = record.get("retweets")
    likes = read_optional_int(likes_raw)
    retweets = read_optional_int(retweets_raw)
    metrics = XPostMetrics(
        likes=likes or 0,
        retweets=retweets or 0,
        replies=read_int(record.get("comments")),
        likes_observed=likes is not None,
        retweets_observed=retweets is not None,
        eligibility_state=eligibility_metrics_state(
            ((likes_raw, likes), (retweets_raw, retweets)),
        ),
    )

    return XCollectedPost(
        tweet_id=tweet_id,
        canonical_url=canonical_url,
        text=text,
        author_handle=author_handle,
        author_name=author_name,
        published_at=published_at,
        metrics=metrics,
        media_urls=read_media_urls(record.get("media")),
        source_product=product,
        trend_score=trend_score(metrics),
        content_kind=content_kind_from_scweet_record(record),
    )


def trend_score(metrics: XPostMetrics) -> float:
    return float(metrics.likes + metrics.retweets * 2 + metrics.replies * 0.5)


def post_is_in_window(
    post: XCollectedPost,
    request: DailySearchRequest,
) -> bool:
    window_end = request.window_end.astimezone(UTC)
    window_start = window_end - timedelta(hours=request.window_hours)
    published_at = post.published_at.astimezone(UTC)

    return window_start <= published_at < window_end


def read_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def read_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    stripped = value.strip()
    return stripped or None


def read_int(value: Any) -> int:
    if isinstance(value, bool):
        return 0

    if isinstance(value, int):
        return max(value, 0)

    if isinstance(value, str) and value.isdigit():
        return int(value)

    return 0


def read_optional_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def content_kind_from_scweet_record(record: Mapping[str, Any]) -> XPostContentKind:
    explicit = read_string(record.get("content_kind"))
    if explicit in {"original_post", "original"}:
        return XPostContentKind.ORIGINAL
    if explicit == "reply":
        return XPostContentKind.REPLY
    if explicit == "quote":
        return XPostContentKind.QUOTE
    if explicit is not None:
        return XPostContentKind.UNKNOWN

    if read_string(record.get("in_reply_to_status_id")) is not None or (
        "replying_to" in record and bool(record.get("replying_to"))
    ):
        return XPostContentKind.REPLY
    if any(
        read_string(record.get(field)) is not None
        for field in ("quoted_status_id", "quoted_status", "quote_url")
    ):
        return XPostContentKind.QUOTE
    # The upstream record must explicitly attest originality. Absence is unknown.
    if record.get("is_original") is True:
        return XPostContentKind.ORIGINAL
    if "replying_to" in record and not record.get("replying_to"):
        return XPostContentKind.ORIGINAL
    return content_kind_from_scweet_raw(record.get("raw"))


def content_kind_from_scweet_raw(value: Any) -> XPostContentKind:
    raw = read_mapping(value)
    tweet = read_mapping(raw.get("tweet")) or raw
    legacy = read_mapping(tweet.get("legacy"))
    if not legacy:
        return XPostContentKind.UNKNOWN

    reply_fields = (
        "in_reply_to_status_id",
        "in_reply_to_status_id_str",
    )
    if any(read_string(legacy.get(field)) is not None for field in reply_fields):
        return XPostContentKind.REPLY

    quoted = tweet.get("quoted_status_result")
    if (isinstance(quoted, Mapping) and bool(quoted)) or (
        legacy.get("is_quote_status") is True
    ):
        return XPostContentKind.QUOTE

    retweeted = legacy.get("retweeted_status_result")
    if isinstance(retweeted, Mapping) and bool(retweeted):
        return XPostContentKind.UNKNOWN

    has_explicit_quote_state = legacy.get("is_quote_status") is False
    has_reply_parent = any(
        read_string(legacy.get(field)) is not None for field in reply_fields
    )
    return (
        XPostContentKind.ORIGINAL
        if has_explicit_quote_state and not has_reply_parent
        else XPostContentKind.UNKNOWN
    )


def eligibility_metrics_state(
    observations: tuple[tuple[Any, int | None], ...],
) -> XEligibilityMetricsState:
    if any(raw is not None and parsed is None for raw, parsed in observations):
        return XEligibilityMetricsState.MALFORMED
    if any(raw is None for raw, _ in observations):
        return XEligibilityMetricsState.MISSING
    return XEligibilityMetricsState.OBSERVED


def read_media_urls(value: Any) -> tuple[str, ...]:
    media = read_mapping(value)
    image_links = media.get("image_links")
    if not isinstance(image_links, list):
        return ()

    return tuple(
        url
        for item in image_links
        if isinstance(item, str) and (url := item.strip())
    )


def parse_scweet_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)

    return parsed.astimezone(UTC)
