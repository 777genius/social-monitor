from __future__ import annotations

import sys
import sqlite3
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

from x_collector.account_pool import AccountLimitOverride, AccountPoolLimits
from x_collector.config import XCollectorSettings
from x_collector.domain import DailySearchRequest, SearchProduct
from x_collector.reloading_scweet_collector import ReloadingScweetDailySearchCollector
from x_collector.scweet_adapter import (
    ScweetDailySearchCollector,
    runtime_limits_from_account_pool,
    scweet_runtime_limits,
)


class ScweetRuntimeLimitsTests(unittest.TestCase):
    def test_default_limits_apply_when_no_account_profiles_exist(self) -> None:
        self.assertEqual(
            scweet_runtime_limits(
                default_daily_requests=30,
                default_daily_tweets=600,
                account_limit_profiles={},
            ),
            AccountLimitOverride(daily_requests=30, daily_tweets=600),
        )
        self.assertEqual(
            runtime_limits_from_account_pool(AccountPoolLimits(30, 600)),
            AccountLimitOverride(daily_requests=30, daily_tweets=600),
        )

    def test_runtime_limits_preserve_higher_per_account_caps(self) -> None:
        self.assertEqual(
            runtime_limits_from_account_pool(
                AccountPoolLimits(
                    30,
                    600,
                    per_account={
                        "low": AccountLimitOverride(12, 120),
                        "high": AccountLimitOverride(120, 2_000),
                    },
                ),
            ),
            AccountLimitOverride(daily_requests=120, daily_tweets=2_000),
        )

    def test_unconfigured_profiles_reach_request_collection_composition(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "scweet.db"
            settings = XCollectorSettings.from_env(
                {"X_COLLECTOR_SCWEET_DB_PATH": str(db_path)}
            )
            request = DailySearchRequest(
                request_id="synthetic-request",
                tenant_id="synthetic-tenant",
                workspace_id="synthetic-workspace",
                source_binding_id="synthetic-binding",
                scan_job_id="synthetic-scan",
                correlation_id="synthetic-correlation",
                query="synthetic query",
                language=None,
                window_hours=24,
                window_end=datetime(2026, 9, 28, tzinfo=UTC),
                search_products=(SearchProduct.TOP,),
                limit_per_product=1,
                max_items=1,
                min_likes=None,
                min_retweets=None,
                min_replies=None,
                cursor=None,
            )
            result = object()

            # The real RPC uses this wrapper. Stub only the provider execution:
            # no Scweet object, credentials, network request, or day run is made.
            with patch.object(
                ScweetDailySearchCollector,
                "collect_daily_search",
                return_value=result,
            ) as collect:
                actual = ReloadingScweetDailySearchCollector(
                    settings
                ).collect_daily_search(request)

            self.assertIs(actual, result)
            collect.assert_called_once_with(request)
            self.assertFalse(db_path.exists())

    def test_unconfigured_profiles_reach_scweet_construction_with_default_caps(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "scweet.db"
            settings = XCollectorSettings.from_env(
                {"X_COLLECTOR_SCWEET_DB_PATH": str(db_path)}
            )
            constructed: dict[str, object] = {}

            class FakeScweetConfig:
                def __init__(self, **kwargs: object) -> None:
                    constructed["config"] = kwargs

            class FakeScweet:
                def __init__(self, **kwargs: object) -> None:
                    constructed["scweet"] = kwargs

            fake_module = ModuleType("Scweet")
            fake_module.ScweetConfig = FakeScweetConfig
            fake_module.Scweet = FakeScweet
            with patch.dict(sys.modules, {"Scweet": fake_module}):
                collector = ScweetDailySearchCollector.from_settings(settings)
                collector._scweet_factory()

            self.assertIsInstance(constructed["config"], dict)
            self.assertEqual(constructed["config"]["daily_requests_limit"], 30)
            self.assertEqual(constructed["config"]["daily_tweets_limit"], 600)
            self.assertIsInstance(constructed["scweet"], dict)
            self.assertIsNone(constructed["scweet"]["cookies_file"])
            self.assertIsNone(constructed["scweet"]["auth_token"])
            self.assertFalse(db_path.exists())

    def test_existing_sqlite_without_accounts_does_not_block_setup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "scweet.db"
            with sqlite3.connect(db_path):
                pass

            settings = XCollectorSettings.from_env(
                {"X_COLLECTOR_SCWEET_DB_PATH": str(db_path)}
            )
            collector = ScweetDailySearchCollector.from_settings(settings)

            self.assertIsInstance(collector, ScweetDailySearchCollector)
            with sqlite3.connect(db_path) as connection:
                runs = connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runs'"
                ).fetchall()
            self.assertEqual(runs, [])

    def test_setup_failure_logs_only_exception_type(self) -> None:
        settings = XCollectorSettings.from_env({})

        def fail_setup(_settings: XCollectorSettings) -> ScweetDailySearchCollector:
            raise RuntimeError("synthetic private detail")

        collector = ReloadingScweetDailySearchCollector(settings, fail_setup)
        with self.assertLogs(
            "x_collector.reloading_scweet_collector", level="ERROR"
        ) as captured:
            with self.assertRaisesRegex(RuntimeError, "synthetic private detail"):
                collector.collect_daily_search(object())

        self.assertEqual(
            captured.output,
            [
                "ERROR:x_collector.reloading_scweet_collector:"
                "X collector setup failed (RuntimeError)"
            ],
        )


if __name__ == "__main__":
    unittest.main()
