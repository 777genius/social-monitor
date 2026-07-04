from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class XCollectorSettings:
    grpc_bind: str
    max_workers: int
    service_token: str | None
    scweet_cookies_file: str | None
    scweet_auth_token: str | None
    scweet_db_path: str
    scweet_proxy: str | None
    scweet_manifest_scrape_on_init: bool
    scweet_daily_requests_limit: int
    scweet_daily_tweets_limit: int
    scweet_requests_per_minute: int
    scweet_min_delay_seconds: float
    scweet_n_splits: int
    scweet_api_page_size: int
    scweet_max_empty_pages: int
    scweet_budget_guard_enabled: bool
    account_observability_enabled: bool

    @classmethod
    def from_env(
        cls,
        env: Mapping[str, str] | None = None,
    ) -> "XCollectorSettings":
        source = os.environ if env is None else env

        return cls(
            grpc_bind=read_string(source, "X_COLLECTOR_GRPC_BIND", "[::]:50051"),
            max_workers=read_int(source, "X_COLLECTOR_GRPC_MAX_WORKERS", 4, 1, 64),
            service_token=read_optional_string(source, "X_COLLECTOR_SERVICE_TOKEN"),
            scweet_cookies_file=read_optional_string(
                source,
                "X_COLLECTOR_SCWEET_COOKIES_FILE",
            ),
            scweet_auth_token=read_optional_string(
                source,
                "X_COLLECTOR_SCWEET_AUTH_TOKEN",
            ),
            scweet_db_path=read_string(
                source,
                "X_COLLECTOR_SCWEET_DB_PATH",
                "var/x-collector/scweet_state.db",
            ),
            scweet_proxy=read_optional_string(source, "X_COLLECTOR_SCWEET_PROXY"),
            scweet_manifest_scrape_on_init=read_bool(
                source,
                "X_COLLECTOR_SCWEET_MANIFEST_SCRAPE_ON_INIT",
                True,
            ),
            scweet_daily_requests_limit=read_int(
                source,
                "X_COLLECTOR_SCWEET_DAILY_REQUESTS_LIMIT",
                30,
                1,
                10_000,
            ),
            scweet_daily_tweets_limit=read_int(
                source,
                "X_COLLECTOR_SCWEET_DAILY_TWEETS_LIMIT",
                600,
                1,
                1_000_000,
            ),
            scweet_requests_per_minute=read_int(
                source,
                "X_COLLECTOR_SCWEET_REQUESTS_PER_MINUTE",
                30,
                1,
                600,
            ),
            scweet_min_delay_seconds=read_float(
                source,
                "X_COLLECTOR_SCWEET_MIN_DELAY_SECONDS",
                2.0,
                0.1,
                120.0,
            ),
            scweet_n_splits=read_int(
                source,
                "X_COLLECTOR_SCWEET_N_SPLITS",
                5,
                1,
                24,
            ),
            scweet_api_page_size=read_int(
                source,
                "X_COLLECTOR_SCWEET_API_PAGE_SIZE",
                20,
                1,
                100,
            ),
            scweet_max_empty_pages=read_int(
                source,
                "X_COLLECTOR_SCWEET_MAX_EMPTY_PAGES",
                1,
                1,
                10,
            ),
            scweet_budget_guard_enabled=read_bool(
                source,
                "X_COLLECTOR_SCWEET_BUDGET_GUARD_ENABLED",
                True,
            ),
            account_observability_enabled=read_bool(
                source,
                "X_COLLECTOR_ACCOUNT_OBSERVABILITY_ENABLED",
                True,
            ),
        )

    def ensure_runtime_paths(self) -> None:
        Path(self.scweet_db_path).parent.mkdir(parents=True, exist_ok=True)


def read_string(source: Mapping[str, str], key: str, fallback: str) -> str:
    value = source.get(key, "").strip()
    return value if value else fallback


def read_optional_string(source: Mapping[str, str], key: str) -> str | None:
    value = source.get(key, "").strip()
    return value or None


def read_bool(source: Mapping[str, str], key: str, fallback: bool) -> bool:
    value = source.get(key)
    if value is None or value.strip() == "":
        return fallback

    return value.strip().lower() in {"1", "true", "yes", "on"}


def read_int(
    source: Mapping[str, str],
    key: str,
    fallback: int,
    minimum: int,
    maximum: int,
) -> int:
    try:
        parsed = int(source.get(key, ""))
    except ValueError:
        return fallback

    return min(max(parsed, minimum), maximum)


def read_float(
    source: Mapping[str, str],
    key: str,
    fallback: float,
    minimum: float,
    maximum: float,
) -> float:
    try:
        parsed = float(source.get(key, ""))
    except ValueError:
        return fallback

    return min(max(parsed, minimum), maximum)
