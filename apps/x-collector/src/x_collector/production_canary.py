from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from .account_pool import AccountPoolLimits
from .account_usage_observer import AccountUsageObserver
from .canary_account_inventory import (
    EX_USAGE,
    REQUIRED_ACCOUNT_COUNT,
    SCHEMA_VERSION,
    blocked_output,
    emit_json,
    load_account_inventory,
)
from .domain import DailySearchRequest, SearchProduct
from .scweet_account_pool_ledger import ScweetAccountPoolLedger
from .scweet_run_identity import ScweetRunIdentityTracker
from .search_plan import ScweetSearchPass
from .sqlite_account_usage_event_repository import (
    SqliteAccountUsageEventRepository,
)


FIXED_QUERY = "(openai OR artificial intelligence) lang:en"
FIXED_QUERY_ID = "x-production-canary-fixed-v1"
PASS_LABEL = "production_canary"
REQUEST_LIMIT = 1
MAX_REQUESTS_PER_ACCOUNT = 2
EX_DATAERR = 65
EX_TEMPFAIL = 75
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}([0-9a-f]{24})?$")
IMAGE_ID_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
SAFE_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
ACCOUNT_RESULT_KEYS = frozenset({
    "status",
    "reasonCode",
    "accountOrdinal",
    "collectionAttempted",
    "requestDelta",
    "fetchedCount",
    "runCompleted",
    "correlationVerified",
    "attributionStatus",
    "warningCodes",
    "requestId",
    "scanJobId",
    "sourceBindingId",
    "passObservationId",
    "collectorRunId",
})
CORRELATION_RESULT_KEYS = (
    "requestId",
    "scanJobId",
    "sourceBindingId",
    "passObservationId",
    "collectorRunId",
)
ACCOUNT_FAILURE_REASON_CODES = frozenset({
    "invalid_account_ordinal",
    "single_account_inventory_invalid",
    "temporary_database_not_empty",
    "collector_initialization_failed",
    "account_baseline_unavailable",
    "collection_failed",
    "run_correlation_missing",
    "terminal_event_ambiguous",
    "pass_start_invalid",
    "pass_success_invalid",
    "state_delta_invalid",
    "failure_or_cooldown_observed",
    "event_correlation_mismatch",
    "run_correlation_mismatch",
    "event_order_invalid",
    "request_budget_invalid",
    "state_delta_not_monotonic",
    "pass_counts_invalid",
    "evidence_schema_missing",
    "run_schema_invalid",
    "run_terminal_ambiguous",
    "run_not_completed",
    "account_state_schema_invalid",
    "account_state_ambiguous",
    "account_terminal_unhealthy",
    "attribution_invalid",
    "evidence_unavailable",
})


class CanaryArgumentError(ValueError):
    pass


class EvidenceFailure(ValueError):
    def __init__(self, reason_code: str) -> None:
        super().__init__(reason_code)
        self.reason_code = reason_code


class QuietArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        del message
        raise CanaryArgumentError("invalid arguments")


@dataclass(frozen=True)
class AccountCheckConfig:
    cookies_file: Path
    db_path: Path
    account_ordinal: int


@dataclass(frozen=True)
class EvidenceContext:
    request_id: str
    scan_job_id: str
    source_binding_id: str
    pass_observation_id: str
    collector_run_id: str


@dataclass(frozen=True)
class AccountEvidence:
    request_delta: int
    fetched_count: int
    attribution_status: str
    warning_codes: tuple[str, ...]
    request_id: str
    scan_job_id: str
    source_binding_id: str
    pass_observation_id: str
    collector_run_id: str


class CanaryClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


ScweetFactory = Callable[[AccountCheckConfig], Any]


def execute_account_check(
    config: AccountCheckConfig,
    scweet_factory: ScweetFactory | None = None,
) -> dict[str, Any]:
    if not 1 <= config.account_ordinal <= REQUIRED_ACCOUNT_COUNT:
        return account_failure(config.account_ordinal, "invalid_account_ordinal", False)
    inventory = load_account_inventory(config.cookies_file)
    if (
        inventory.malformed
        or inventory.duplicate
        or inventory.observed_count != 1
        or len(inventory.entries) != 1
    ):
        return account_failure(config.account_ordinal, "single_account_inventory_invalid", False)
    if config.db_path.exists():
        return account_failure(config.account_ordinal, "temporary_database_not_empty", False)

    config.db_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    factory = scweet_factory or build_scweet
    try:
        scweet = factory(config)
    except Exception:
        return account_failure(config.account_ordinal, "collector_initialization_failed", False)

    clock = CanaryClock()
    ledger = ScweetAccountPoolLedger(
        str(config.db_path),
        AccountPoolLimits(daily_requests=MAX_REQUESTS_PER_ACCOUNT, daily_tweets=100),
    )
    observer = AccountUsageObserver(
        ledger,
        SqliteAccountUsageEventRepository(str(config.db_path)),
        clock,
    )
    request = canary_request(config.account_ordinal, clock.now())
    search_pass = ScweetSearchPass(
        label=PASS_LABEL,
        product=SearchProduct.LATEST,
        limit=REQUEST_LIMIT,
        min_likes=None,
        min_retweets=None,
        min_replies=None,
    )
    usage = observer.begin_pass(request, search_pass, MAX_REQUESTS_PER_ACCOUNT)
    if usage.before_snapshot is None or len(usage.before_snapshot.accounts) != 1:
        return account_failure(config.account_ordinal, "account_baseline_unavailable", False)

    tracker = ScweetRunIdentityTracker(str(config.db_path))
    try:
        with tracker:
            records = scweet.search(
                FIXED_QUERY,
                lang="en",
                display_type="Latest",
                limit=REQUEST_LIMIT,
                min_likes=None,
                min_retweets=None,
                min_replies=None,
                save=False,
                resume=False,
            )
        usage = replace(usage, collector_run_id=tracker.collector_run_id)
        fetched_count = len(records) if isinstance(records, list) else 0
        observer.complete_pass_success(
            request,
            usage,
            fetched_count=fetched_count,
            accepted_count=fetched_count,
        )
    except Exception:
        usage = replace(usage, collector_run_id=tracker.collector_run_id)
        observer.complete_pass_failure(
            request,
            usage,
            failure_kind="collection_failed",
        )
        return account_failure(config.account_ordinal, "collection_failed", True)

    if usage.pass_observation_id is None or usage.collector_run_id is None:
        return account_failure(config.account_ordinal, "run_correlation_missing", True)
    try:
        evidence = validate_account_evidence(
            config.db_path,
            EvidenceContext(
                request_id=request.request_id,
                scan_job_id=request.scan_job_id,
                source_binding_id=request.source_binding_id,
                pass_observation_id=usage.pass_observation_id,
                collector_run_id=usage.collector_run_id,
            ),
        )
    except (EvidenceFailure, OSError, sqlite3.Error) as failure:
        reason_code = (
            failure.reason_code
            if isinstance(failure, EvidenceFailure)
            else "evidence_unavailable"
        )
        return account_failure(config.account_ordinal, reason_code, True)

    return {
        "status": "passed",
        "reasonCode": "account_passed",
        "accountOrdinal": config.account_ordinal,
        "collectionAttempted": True,
        "requestDelta": evidence.request_delta,
        "fetchedCount": evidence.fetched_count,
        "runCompleted": True,
        "correlationVerified": True,
        "attributionStatus": evidence.attribution_status,
        "warningCodes": list(evidence.warning_codes),
        "requestId": evidence.request_id,
        "scanJobId": evidence.scan_job_id,
        "sourceBindingId": evidence.source_binding_id,
        "passObservationId": evidence.pass_observation_id,
        "collectorRunId": evidence.collector_run_id,
    }


def build_scweet(config: AccountCheckConfig) -> Any:
    from Scweet import Scweet, ScweetConfig

    scweet_config = ScweetConfig(
        daily_requests_limit=MAX_REQUESTS_PER_ACCOUNT,
        daily_tweets_limit=100,
        requests_per_min=2,
        min_delay_s=2.0,
        n_splits=1,
        api_page_size=1,
        max_empty_pages=1,
    )
    return Scweet(
        cookies_file=str(config.cookies_file),
        auth_token=None,
        db_path=str(config.db_path),
        proxy=None,
        manifest_scrape_on_init=False,
        config=scweet_config,
        provision=True,
    )


def canary_request(account_ordinal: int, now: datetime) -> DailySearchRequest:
    suffix = str(account_ordinal)
    return DailySearchRequest(
        request_id=f"x-production-canary-request-{suffix}",
        tenant_id="production-canary",
        workspace_id="production-canary",
        source_binding_id=f"x-production-canary-binding-{suffix}",
        scan_job_id=f"x-production-canary-scan-{suffix}",
        correlation_id=f"x-production-canary-correlation-{suffix}",
        query=FIXED_QUERY,
        language="en",
        window_hours=24,
        window_end=now,
        search_products=(SearchProduct.LATEST,),
        limit_per_product=REQUEST_LIMIT,
        max_items=REQUEST_LIMIT,
        min_likes=None,
        min_retweets=None,
        min_replies=None,
        cursor=None,
    )


def validate_account_evidence(
    db_path: Path,
    context: EvidenceContext,
) -> AccountEvidence:
    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        require_tables(connection, ("accounts", "runs", "account_usage_events"))
        events = connection.execute(
            "SELECT * FROM account_usage_events ORDER BY occurred_at, rowid",
        ).fetchall()
        if len(events) != 3:
            raise EvidenceFailure("terminal_event_ambiguous")
        by_type = group_events(events)
        started = exactly_one(by_type, "pass_started", "pass_start_invalid")
        succeeded = exactly_one(by_type, "pass_succeeded", "pass_success_invalid")
        delta = exactly_one(
            by_type,
            "account_state_delta_observed",
            "state_delta_invalid",
        )
        if set(by_type) != {
            "pass_started",
            "pass_succeeded",
            "account_state_delta_observed",
        }:
            raise EvidenceFailure("failure_or_cooldown_observed")

        for event in events:
            if (
                event["provider"] != "x-twitter"
                or event["request_id"] != context.request_id
                or event["scan_job_id"] != context.scan_job_id
                or event["source_binding_id"] != context.source_binding_id
                or event["query"] != FIXED_QUERY
                or event["pass_label"] != PASS_LABEL
                or event["product"] != SearchProduct.LATEST.value
                or event["pass_observation_id"] != context.pass_observation_id
            ):
                raise EvidenceFailure("event_correlation_mismatch")
        if started["collector_run_id"] is not None:
            raise EvidenceFailure("event_correlation_mismatch")
        if any(
            event["collector_run_id"] != context.collector_run_id
            for event in (succeeded, delta)
        ):
            raise EvidenceFailure("run_correlation_mismatch")
        if any(event["failure_kind"] is not None for event in events):
            raise EvidenceFailure("failure_or_cooldown_observed")
        if any(event["cooldown_reason"] is not None for event in events):
            raise EvidenceFailure("failure_or_cooldown_observed")

        validate_event_order(started, succeeded, delta)
        request_delta = validate_state_delta(delta)
        fetched_count = read_nonnegative_int(succeeded["fetched_count"])
        accepted_count = read_nonnegative_int(succeeded["accepted_count"])
        if fetched_count is None or accepted_count is None:
            raise EvidenceFailure("pass_counts_invalid")
        if fetched_count != accepted_count or fetched_count > REQUEST_LIMIT:
            raise EvidenceFailure("pass_counts_invalid")

        validate_run(connection, context.collector_run_id)
        validate_account_terminal(connection, delta)
        attribution = validate_attribution(succeeded, delta)

    warning_codes = (
        ("attribution_unknown",)
        if attribution == "unknown"
        else ()
    )
    return AccountEvidence(
        request_delta=request_delta,
        fetched_count=fetched_count,
        attribution_status=attribution,
        warning_codes=warning_codes,
        request_id=context.request_id,
        scan_job_id=context.scan_job_id,
        source_binding_id=context.source_binding_id,
        pass_observation_id=context.pass_observation_id,
        collector_run_id=context.collector_run_id,
    )


def require_tables(connection: sqlite3.Connection, names: tuple[str, ...]) -> None:
    present = {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'",
        )
    }
    if not set(names).issubset(present):
        raise EvidenceFailure("evidence_schema_missing")


def group_events(events: Sequence[sqlite3.Row]) -> dict[str, list[sqlite3.Row]]:
    grouped: dict[str, list[sqlite3.Row]] = {}
    for event in events:
        grouped.setdefault(str(event["event_type"]), []).append(event)
    return grouped


def exactly_one(
    grouped: Mapping[str, list[sqlite3.Row]],
    event_type: str,
    reason_code: str,
) -> sqlite3.Row:
    rows = grouped.get(event_type, [])
    if len(rows) != 1:
        raise EvidenceFailure(reason_code)
    return rows[0]


def validate_event_order(*events: sqlite3.Row) -> None:
    timestamps = [event["occurred_at"] for event in events]
    if not all(isinstance(value, str) and value for value in timestamps):
        raise EvidenceFailure("event_order_invalid")
    if timestamps != sorted(timestamps):
        raise EvidenceFailure("event_order_invalid")


def validate_state_delta(delta: sqlite3.Row) -> int:
    requests_before = read_nonnegative_int(delta["requests_before"])
    requests_after = read_nonnegative_int(delta["requests_after"])
    tweets_before = read_nonnegative_int(delta["tweets_before"])
    tweets_after = read_nonnegative_int(delta["tweets_after"])
    if None in (requests_before, requests_after, tweets_before, tweets_after):
        raise EvidenceFailure("state_delta_invalid")
    assert requests_before is not None and requests_after is not None
    assert tweets_before is not None and tweets_after is not None
    request_delta = requests_after - requests_before
    if not 1 <= request_delta <= MAX_REQUESTS_PER_ACCOUNT:
        raise EvidenceFailure("request_budget_invalid")
    if tweets_after < tweets_before:
        raise EvidenceFailure("state_delta_not_monotonic")
    if delta["observation_relation"] != "overlaps_pass_observation_window":
        raise EvidenceFailure("state_delta_invalid")
    return request_delta


def validate_run(connection: sqlite3.Connection, collector_run_id: str) -> None:
    columns = {
        str(row[1])
        for row in connection.execute("PRAGMA table_info(runs)")
    }
    if not {"run_id", "status", "finished_at"}.issubset(columns):
        raise EvidenceFailure("run_schema_invalid")
    rows = connection.execute(
        "SELECT run_id, status, finished_at FROM runs",
    ).fetchall()
    if len(rows) != 1 or rows[0]["run_id"] != collector_run_id:
        raise EvidenceFailure("run_terminal_ambiguous")
    if rows[0]["status"] != "completed" or rows[0]["finished_at"] is None:
        raise EvidenceFailure("run_not_completed")


def validate_account_terminal(
    connection: sqlite3.Connection,
    delta: sqlite3.Row,
) -> None:
    columns = {
        str(row[1])
        for row in connection.execute("PRAGMA table_info(accounts)")
    }
    required = {
        "id",
        "status",
        "daily_requests",
        "available_til",
        "busy",
        "cooldown_reason",
    }
    if not required.issubset(columns):
        raise EvidenceFailure("account_state_schema_invalid")
    rows = connection.execute(
        """
        SELECT id, status, daily_requests, available_til, busy, cooldown_reason
        FROM accounts
        """,
    ).fetchall()
    if len(rows) != 1 or rows[0]["id"] != delta["account_id"]:
        raise EvidenceFailure("account_state_ambiguous")
    row = rows[0]
    if (
        row["status"] != 1
        or row["daily_requests"] != delta["requests_after"]
        or row["available_til"] is not None
        or bool(row["busy"])
        or row["cooldown_reason"] is not None
    ):
        raise EvidenceFailure("account_terminal_unhealthy")


def validate_attribution(succeeded: sqlite3.Row, delta: sqlite3.Row) -> str:
    values = {succeeded["attribution_status"], delta["attribution_status"]}
    if len(values) != 1 or next(iter(values)) not in {"known", "unknown"}:
        raise EvidenceFailure("attribution_invalid")
    return str(next(iter(values)))


def read_nonnegative_int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def account_failure(
    account_ordinal: int,
    reason_code: str,
    attempted: bool,
) -> dict[str, Any]:
    return {
        "status": "failed",
        "reasonCode": reason_code,
        "accountOrdinal": account_ordinal,
        "collectionAttempted": attempted,
        "requestDelta": 0,
        "fetchedCount": 0,
        "runCompleted": False,
        "correlationVerified": False,
        "attributionStatus": "unknown",
        "warningCodes": [],
        "requestId": "",
        "scanJobId": "",
        "sourceBindingId": "",
        "passObservationId": "",
        "collectorRunId": "",
    }


def aggregate_results(
    results: Sequence[Mapping[str, Any]],
    expected_sha: str,
    image_id: str,
) -> dict[str, Any]:
    normalized = [normalize_account_result(result) for result in results]
    ordinals = [result["accountOrdinal"] for result in normalized]
    all_present = len(normalized) == REQUIRED_ACCOUNT_COUNT and sorted(ordinals) == [
        1,
        2,
        3,
        4,
    ]
    all_passed = all_present and all(
        result["status"] == "passed" for result in normalized
    )
    unique_correlation = all_passed and correlation_ids_are_unique(normalized)
    total_fetched = sum(int(result["fetchedCount"]) for result in normalized)
    if all_passed and not unique_correlation:
        status = "failed"
        reason_code = "correlation_identifier_reused"
    elif not all_passed:
        status = "failed"
        reason_code = "account_evidence_failed"
    elif total_fetched == 0:
        status = "inconclusive_content"
        reason_code = "all_accounts_zero_fetched"
    else:
        status = "passed"
        reason_code = "canary_passed"
    warnings = sorted({
        str(code)
        for result in normalized
        for code in result["warningCodes"]
    })
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": status,
        "reasonCode": reason_code,
        "requiredAccountCount": REQUIRED_ACCOUNT_COUNT,
        "observedAccountCount": len(normalized),
        "collectionAttempted": any(
            bool(result["collectionAttempted"]) for result in normalized
        ),
        "expectedSha": expected_sha,
        "imageId": image_id,
        "fixedQueryId": FIXED_QUERY_ID,
        "accounts": normalized,
        "totalFetchedCount": total_fetched,
        "warningCodes": warnings,
    }


def normalize_account_result(result: Mapping[str, Any]) -> dict[str, Any]:
    if set(result) != ACCOUNT_RESULT_KEYS:
        raise EvidenceFailure("account_result_schema_invalid")
    ordinal = read_nonnegative_int(result.get("accountOrdinal"))
    request_delta = read_nonnegative_int(result.get("requestDelta"))
    fetched_count = read_nonnegative_int(result.get("fetchedCount"))
    warning_codes = result.get("warningCodes")
    if (
        ordinal is None
        or request_delta is None
        or fetched_count is None
        or not isinstance(warning_codes, list)
        or not all(isinstance(code, str) for code in warning_codes)
        or not isinstance(result.get("status"), str)
        or not isinstance(result.get("reasonCode"), str)
        or not isinstance(result.get("collectionAttempted"), bool)
        or not isinstance(result.get("runCompleted"), bool)
        or not isinstance(result.get("correlationVerified"), bool)
        or result.get("attributionStatus") not in {"known", "unknown"}
        or any(not isinstance(result.get(key), str) for key in CORRELATION_RESULT_KEYS)
    ):
        raise EvidenceFailure("account_result_schema_invalid")
    if result["status"] == "passed":
        expected_warnings = (
            ["attribution_unknown"]
            if result["attributionStatus"] == "unknown"
            else []
        )
        if (
            result["reasonCode"] != "account_passed"
            or not result["collectionAttempted"]
            or not result["runCompleted"]
            or not result["correlationVerified"]
            or not 1 <= request_delta <= MAX_REQUESTS_PER_ACCOUNT
            or result["warningCodes"] != expected_warnings
            or any(
                SAFE_IDENTIFIER_PATTERN.fullmatch(str(result[key])) is None
                for key in CORRELATION_RESULT_KEYS
            )
        ):
            raise EvidenceFailure("account_result_semantics_invalid")
    elif result["status"] == "failed":
        if (
            result["reasonCode"] not in ACCOUNT_FAILURE_REASON_CODES
            or request_delta != 0
            or fetched_count != 0
            or result["runCompleted"]
            or result["correlationVerified"]
            or result["attributionStatus"] != "unknown"
            or result["warningCodes"]
            or any(result[key] for key in CORRELATION_RESULT_KEYS)
        ):
            raise EvidenceFailure("account_result_semantics_invalid")
    else:
        raise EvidenceFailure("account_result_semantics_invalid")
    return dict(result)


def correlation_ids_are_unique(results: Sequence[Mapping[str, Any]]) -> bool:
    return all(
        len({str(result[key]) for result in results}) == REQUIRED_ACCOUNT_COUNT
        for key in CORRELATION_RESULT_KEYS
    )


def build_parser() -> QuietArgumentParser:
    parser = QuietArgumentParser(add_help=False)
    subparsers = parser.add_subparsers(dest="action", required=True)
    run_parser = subparsers.add_parser("run", add_help=False)
    run_parser.add_argument("--cookies-file", required=True)
    run_parser.add_argument("--db-path", required=True)
    run_parser.add_argument("--account-ordinal", type=int, required=True)
    aggregate_parser = subparsers.add_parser("aggregate", add_help=False)
    aggregate_parser.add_argument("--results-dir", required=True)
    aggregate_parser.add_argument("--expected-sha", required=True)
    aggregate_parser.add_argument("--image-id", required=True)
    validate_parser = subparsers.add_parser("validate-result", add_help=False)
    validate_parser.add_argument("--result-file", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    try:
        arguments = build_parser().parse_args(argv)
    except (CanaryArgumentError, ValueError):
        emit_json(blocked_output("invalid_arguments", 0))
        return EX_USAGE

    if arguments.action == "run":
        result = execute_account_check(
            AccountCheckConfig(
                cookies_file=Path(arguments.cookies_file),
                db_path=Path(arguments.db_path),
                account_ordinal=arguments.account_ordinal,
            ),
        )
        emit_json(result)
        return 0 if result["status"] == "passed" else EX_DATAERR

    if arguments.action == "validate-result":
        try:
            result = json.loads(
                Path(arguments.result_file).read_text(encoding="utf-8"),
            )
            normalized = normalize_account_result(result)
        except (
            OSError,
            UnicodeError,
            json.JSONDecodeError,
            EvidenceFailure,
            TypeError,
        ):
            return EX_DATAERR
        return 0 if normalized["status"] == "passed" else EX_DATAERR

    if (
        SHA_PATTERN.fullmatch(arguments.expected_sha) is None
        or IMAGE_ID_PATTERN.fullmatch(arguments.image_id) is None
    ):
        emit_json(blocked_output("invalid_arguments", REQUIRED_ACCOUNT_COUNT))
        return EX_USAGE
    try:
        results = []
        for ordinal in range(1, REQUIRED_ACCOUNT_COUNT + 1):
            result_path = Path(arguments.results_dir) / f"account-{ordinal}.json"
            if result_path.exists():
                results.append(json.loads(result_path.read_text(encoding="utf-8")))
        payload = aggregate_results(
            results,
            arguments.expected_sha,
            arguments.image_id,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, EvidenceFailure, TypeError):
        payload = {
            "schemaVersion": SCHEMA_VERSION,
            "status": "failed",
            "reasonCode": "account_evidence_unavailable",
            "requiredAccountCount": REQUIRED_ACCOUNT_COUNT,
            "observedAccountCount": 0,
            "collectionAttempted": True,
            "expectedSha": arguments.expected_sha,
            "imageId": arguments.image_id,
            "fixedQueryId": FIXED_QUERY_ID,
            "accounts": [],
            "totalFetchedCount": 0,
            "warningCodes": [],
        }
    emit_json(payload)
    if payload["status"] == "passed":
        return 0
    if payload["status"] == "inconclusive_content":
        return EX_TEMPFAIL
    return EX_DATAERR


if __name__ == "__main__":
    raise SystemExit(main())
