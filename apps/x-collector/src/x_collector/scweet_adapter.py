from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable, Mapping

from . import __version__
from .config import XCollectorSettings
from .domain import (
    DailySearchRequest,
    DailySearchResult,
    SearchProduct,
    XCollectedPost,
    XCollectorAuthError,
    XCollectorRateLimitError,
    XCollectorRun,
    XCollectorUnavailableError,
    XCollectorWarning,
    XPostMetrics,
)
from .ports import Clock, DailySearchCollectorPort
from .scoring import CandidateSignal, rank_candidates
from .search_plan import ScweetSearchPass, plan_scweet_search_passes


ScweetFactory = Callable[[], Any]


@dataclass(frozen=True)
class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class ScweetDailySearchCollector(DailySearchCollectorPort):
    def __init__(
        self,
        scweet_factory: ScweetFactory,
        clock: Clock | None = None,
        scweet_db_path: str | None = None,
    ) -> None:
        self._scweet_factory = scweet_factory
        self._clock = clock or SystemClock()
        self._scweet_db_path = scweet_db_path

    @classmethod
    def from_settings(
        cls,
        settings: XCollectorSettings,
        clock: Clock | None = None,
    ) -> "ScweetDailySearchCollector":
        settings.ensure_runtime_paths()

        def create_scweet() -> Any:
            from Scweet import Scweet, ScweetConfig

            config = ScweetConfig(
                daily_requests_limit=settings.scweet_daily_requests_limit,
                daily_tweets_limit=settings.scweet_daily_tweets_limit,
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

        return cls(create_scweet, clock, settings.scweet_db_path)

    def collect_daily_search(
        self,
        request: DailySearchRequest,
    ) -> DailySearchResult:
        started_at = self._clock.now()
        scweet = self._scweet_factory()
        since, until = scweet_date_window(request)
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

        for search_pass in plan_scweet_search_passes(request):
            try:
                records = run_scweet_search_pass(
                    scweet,
                    request=request,
                    search_pass=search_pass,
                    since=since,
                    until=until,
                )
            except Exception as exc:
                classified = classify_scweet_error(
                    exc,
                    clock=self._clock,
                    scweet_db_path=self._scweet_db_path,
                )
                if (
                    isinstance(classified, XCollectorRateLimitError)
                    and len(fetched_posts) > 0
                ):
                    warnings.append(
                        XCollectorWarning(
                            code="x_collector.partial_rate_limit",
                            message=(
                                f"{search_pass.label} hit a rate limit after "
                                "earlier passes returned posts; returning "
                                "partial daily search results"
                            ),
                        ),
                    )
                    break

                raise classified from exc

            accepted_count = 0
            for rank, record in enumerate(records, start=1):
                post = post_from_scweet_record(record, search_pass.product)
                if post is not None and post_is_in_window(post, request):
                    fetched_posts.append((
                        post,
                        CandidateSignal(
                            pass_label=search_pass.label,
                            product=search_pass.product,
                            rank=rank,
                        ),
                    ))
                    accepted_count += 1

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

        selected_posts = rank_candidates(
            fetched_posts,
            query=request.query,
            window_end=request.window_end,
            max_items=request.max_items,
        )
        completed_at = self._clock.now()

        return DailySearchResult(
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
    until_date = (window_end.date() + timedelta(days=1)).isoformat()

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

    metrics = XPostMetrics(
        likes=read_int(record.get("likes")),
        retweets=read_int(record.get("retweets")),
        replies=read_int(record.get("comments")),
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

    return window_start <= published_at <= window_end + timedelta(minutes=5)


def classify_scweet_error(
    exc: Exception,
    *,
    clock: Clock | None = None,
    scweet_db_path: str | None = None,
) -> Exception:
    message = str(exc).lower()

    if any(token in message for token in ["auth", "cookie", "token", "401"]):
        return XCollectorAuthError("Scweet authentication failed")

    if any(
        token in message
        for token in ["rate", "limit", "cooldown", "daily cap", "429"]
    ):
        now = (clock or SystemClock()).now()
        reset_at = (
            rate_limit_reset_from_message(str(exc))
            or rate_limit_reset_from_scweet_db(scweet_db_path, now)
            or now + timedelta(minutes=15)
        )
        retry_after_ms = max(
            1,
            int((reset_at - now).total_seconds() * 1000),
        )
        return XCollectorRateLimitError(
            "Scweet rate limit reached",
            retry_after_ms=retry_after_ms,
            reset_at=reset_at,
        )

    return XCollectorUnavailableError("Scweet collection failed")


def rate_limit_reset_from_message(message: str) -> datetime | None:
    match = re.search(r"\breset=(\d{10,})\b", message)
    if match is None:
        return None

    return datetime.fromtimestamp(int(match.group(1)), UTC)


def rate_limit_reset_from_scweet_db(
    scweet_db_path: str | None,
    now: datetime,
) -> datetime | None:
    if scweet_db_path is None or scweet_db_path == ":memory:":
        return None
    if not Path(scweet_db_path).exists():
        return None

    try:
        with sqlite3.connect(scweet_db_path) as connection:
            row = connection.execute(
                """
                SELECT MAX(available_til)
                FROM accounts
                WHERE cooldown_reason = 'rate_limit'
                  AND available_til IS NOT NULL
                """,
            ).fetchone()
    except sqlite3.Error:
        return None

    value = row[0] if row is not None else None
    if not isinstance(value, (int, float)):
        return None

    reset_at = datetime.fromtimestamp(float(value), UTC)
    if reset_at <= now or reset_at > now + timedelta(hours=24):
        return None

    return reset_at


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
