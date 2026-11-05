from __future__ import annotations

import unittest
from datetime import UTC, datetime
from types import SimpleNamespace

from x_collector.canonical_search_invocation import CanonicalInvocation


class PreRunDiagnosticTests(unittest.TestCase):
    def test_pre_run_failure_logs_only_stage_and_class(self) -> None:
        """SDK startup and account preflight crashes need distinct safe diagnostics."""
        for failing_stage, expected_stage in (
            ("start_execution", "scweet_init"),
            ("prepare_account_pool", "account_pool_prepare"),
        ):
            with self.subTest(stage=failing_stage):
                private_detail = "synthetic-query-cookie-token"

                def fail() -> None:
                    raise ValueError(private_detail)

                services = SimpleNamespace(
                    clock=SimpleNamespace(now=lambda: datetime(2026, 9, 29, tzinfo=UTC)),
                    start_execution=lambda: object(),
                    prepare_account_pool=lambda: None,
                )
                setattr(services, failing_stage, fail)

                with self.assertLogs("x_collector.canonical_search_invocation", "ERROR") as logs:
                    with self.assertRaisesRegex(ValueError, private_detail):
                        CanonicalInvocation(services).run(object())

                self.assertEqual(
                    logs.output,
                    ["ERROR:x_collector.canonical_search_invocation:"
                     f"X collector failure stage={expected_stage} error_class=ValueError"],
                )
                self.assertTrue(all(record.exc_info is None for record in logs.records))
