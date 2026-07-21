from __future__ import annotations

import json
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import ANY

import pytest

from x_collector.canary_account_inventory import (
    ACCOUNT_SET_REASON,
    EX_CONFIG,
    EX_USAGE,
    INVENTORY_UNAVAILABLE_REASON,
    load_account_inventory,
    main as inventory_main,
    write_single_account_files,
)
from x_collector.production_canary import (
    AccountCheckConfig,
    EvidenceContext,
    EvidenceFailure,
    EX_DATAERR,
    FIXED_QUERY,
    MAX_REQUESTS_PER_ACCOUNT,
    SCHEMA_VERSION,
    aggregate_results,
    build_scweet,
    execute_account_check,
    main as canary_main,
    validate_account_evidence,
)


def account(username: str) -> dict[str, str]:
    return {
        "username": username,
        "auth_token": f"fixture-auth-{username}",
        "ct0": f"fixture-csrf-{username}",
    }


def test_two_accounts_block_with_exact_redacted_output(tmp_path, capsys) -> None:
    cookies_file = write_inventory(tmp_path, [account("one"), account("two")])

    assert inventory_main(["check", "--cookies-file", str(cookies_file)]) == EX_CONFIG

    assert json.loads(capsys.readouterr().out) == {
        "schemaVersion": "x-production-account-canary.v1",
        "status": "blocked",
        "reasonCode": ACCOUNT_SET_REASON,
        "requiredAccountCount": 4,
        "observedAccountCount": 2,
        "collectionAttempted": False,
    }


@pytest.mark.parametrize(
    ("payload", "reason_code", "observed_count"),
    [
        (
            [account("one"), account("two"), account("three"), account("one")],
            ACCOUNT_SET_REASON,
            3,
        ),
        (
            [account("one"), account("two"), account("three"), {"username": "four"}],
            INVENTORY_UNAVAILABLE_REASON,
            3,
        ),
        ("not-an-inventory", INVENTORY_UNAVAILABLE_REASON, 0),
    ],
)
def test_duplicate_and_malformed_inventory_block(
    tmp_path,
    capsys,
    payload,
    reason_code: str,
    observed_count: int,
) -> None:
    cookies_file = tmp_path / "cookies.json"
    cookies_file.write_text(json.dumps(payload), encoding="utf-8")

    assert inventory_main(["check", "--cookies-file", str(cookies_file)]) == EX_CONFIG

    output = json.loads(capsys.readouterr().out)
    assert output == {
        "schemaVersion": "x-production-account-canary.v1",
        "status": "blocked",
        "reasonCode": reason_code,
        "requiredAccountCount": 4,
        "observedAccountCount": observed_count,
        "collectionAttempted": False,
    }
    assert "fixture-cookie" not in json.dumps(output)


@pytest.mark.parametrize(
    "payload",
    [
        [],
        [account("one"), account("two")],
        [account("one"), account("two"), account("three")],
        [account("one"), account("one")],
        [{"username": "one"}],
        [account(str(index)) for index in range(5)],
    ],
)
def test_invalid_local_inventory_never_builds_collector(tmp_path, payload) -> None:
    cookies_file = write_inventory(tmp_path, payload)
    calls = 0

    def forbidden_factory(config: AccountCheckConfig):
        nonlocal calls
        del config
        calls += 1
        raise AssertionError("network-capable factory must not be called")

    result = execute_account_check(
        AccountCheckConfig(cookies_file, tmp_path / "state.db", 1),
        forbidden_factory,
    )

    assert result["status"] == "failed"
    assert result["collectionAttempted"] is False
    assert calls == 0


def test_duplicate_credential_source_with_different_identities_is_rejected(
    tmp_path,
) -> None:
    payload = [account("one"), account("two"), account("three"), account("four")]
    payload[3]["auth_token"] = payload[0]["auth_token"]

    inventory = load_account_inventory(write_inventory(tmp_path, payload))

    assert inventory.duplicate is True
    assert inventory.observed_count == 3
    assert inventory.reason_code == ACCOUNT_SET_REASON


def test_conflicting_username_aliases_are_malformed_before_collection(
    tmp_path,
) -> None:
    payload = [account(f"label-{ordinal}") for ordinal in range(1, 5)]
    for item in payload:
        item["screen_name"] = "@same-real-handle"

    inventory = load_account_inventory(write_inventory(tmp_path, payload))

    assert inventory.ready is False
    assert inventory.malformed is True
    assert inventory.observed_count == 0
    assert inventory.reason_code == INVENTORY_UNAVAILABLE_REASON


def test_shared_canonical_alias_across_entries_is_duplicate(tmp_path) -> None:
    payload = [account(name) for name in ("one", "two", "three", "four")]
    for ordinal, item in enumerate(payload):
        item.pop("username")
        item[("screen_name", "handle", "account_name", "screen_name")[ordinal]] = (
            "@same-real-handle"
        )

    inventory = load_account_inventory(write_inventory(tmp_path, payload))

    assert inventory.ready is False
    assert inventory.duplicate is True
    assert inventory.observed_count == 1
    assert inventory.reason_code == ACCOUNT_SET_REASON


def test_non_auth_cookie_containers_are_malformed_and_redacted(tmp_path, capsys) -> None:
    payload = [
        {"username": name, "cookies": {"lang": "en"}}
        for name in ("one", "two", "three", "four")
    ]
    cookies_file = write_inventory(tmp_path, payload)

    assert inventory_main(["check", "--cookies-file", str(cookies_file)]) == EX_CONFIG

    output = json.loads(capsys.readouterr().out)
    assert output == {
        "schemaVersion": SCHEMA_VERSION,
        "status": "blocked",
        "reasonCode": INVENTORY_UNAVAILABLE_REASON,
        "requiredAccountCount": 4,
        "observedAccountCount": 0,
        "collectionAttempted": False,
    }
    assert "lang" not in json.dumps(output)


def test_nested_auth_and_csrf_cookies_are_supported(tmp_path) -> None:
    payload = [
        {
            "username": name,
            "cookies": {
                "auth_token": f"fixture-auth-{name}",
                "ct0": f"fixture-csrf-{name}",
                "lang": "en",
            },
        }
        for name in ("one", "two", "three", "four")
    ]

    inventory = load_account_inventory(write_inventory(tmp_path, payload))

    assert inventory.ready is True
    assert inventory.observed_count == 4


def test_every_auth_representation_is_fail_closed_before_collection(tmp_path) -> None:
    payload = [account(name) for name in ("one", "two", "three", "four")]
    for item in payload:
        item["cookies"] = {
            "auth_token": "shared-nested-auth",
            "ct0": "shared-nested-csrf",
        }

    inventory = load_account_inventory(write_inventory(tmp_path, payload))

    assert inventory.ready is False
    assert inventory.malformed is True
    assert inventory.observed_count == 0
    assert inventory.reason_code == INVENTORY_UNAVAILABLE_REASON


@pytest.mark.parametrize(
    "extra_auth_material",
    [
        {"cookies": {"auth_token": "nested-auth-only"}},
        {"cookieJar": {"csrf_token": "nested-csrf-only"}},
        {
            "cookies_json": {
                "authToken": "conflicting-nested-auth",
                "csrf": "conflicting-nested-csrf",
            },
        },
        {"token": "conflicting-top-level-auth-alias"},
    ],
)
def test_partial_or_conflicting_auth_sources_are_malformed(
    tmp_path,
    extra_auth_material: dict[str, object],
) -> None:
    payload: dict[str, object] = account("only")
    payload.update(extra_auth_material)

    inventory = load_account_inventory(write_inventory(tmp_path, [payload]))

    assert inventory.malformed is True
    assert inventory.observed_count == 0
    assert inventory.reason_code == INVENTORY_UNAVAILABLE_REASON


def test_auth_and_csrf_aliases_are_supported_as_one_unambiguous_source(
    tmp_path,
) -> None:
    payload = [
        {"username": "one", "authToken": "auth-one", "csrf": "csrf-one"},
        {"username": "two", "token": "auth-two", "csrf_token": "csrf-two"},
        {
            "username": "three",
            "cookies_json": {"authToken": "auth-three", "csrf": "csrf-three"},
        },
        {
            "username": "four",
            "cookieJar": [
                {"name": "token", "value": "auth-four"},
                {"name": "csrf_token", "value": "csrf-four"},
            ],
        },
    ]

    inventory = load_account_inventory(write_inventory(tmp_path, payload))

    assert inventory.ready is True
    assert inventory.observed_count == 4


def test_prepares_four_isolated_single_account_files(tmp_path) -> None:
    cookies_file = write_inventory(
        tmp_path,
        [account("one"), account("two"), account("three"), account("four")],
    )
    inventory = load_account_inventory(cookies_file)
    output_dir = tmp_path / "isolated"

    write_single_account_files(inventory, output_dir)

    for ordinal in range(1, 5):
        account_file = output_dir / f"account-{ordinal}.json"
        single = load_account_inventory(account_file)
        assert single.observed_count == 1
        assert len(single.entries) == 1
        assert account_file.stat().st_mode & 0o777 == 0o600
    assert output_dir.stat().st_mode & 0o777 == 0o700


def test_single_account_happy_path_requires_complete_correlated_evidence(tmp_path) -> None:
    cookies_file = write_inventory(tmp_path, [account("only")])

    result = execute_account_check(
        AccountCheckConfig(cookies_file, tmp_path / "state.db", 1),
        fake_scweet_factory(request_delta=1, fetched_count=1),
    )

    assert result == {
        "status": "passed",
        "reasonCode": "account_passed",
        "accountOrdinal": 1,
        "collectionAttempted": True,
        "requestDelta": 1,
        "fetchedCount": 1,
        "runCompleted": True,
        "correlationVerified": True,
        "attributionStatus": "unknown",
        "warningCodes": ["attribution_unknown"],
        "requestId": "x-production-canary-request-1",
        "scanJobId": "x-production-canary-scan-1",
        "sourceBindingId": "x-production-canary-binding-1",
        "passObservationId": ANY,
        "collectorRunId": "fixture-run",
    }


def test_bad_run_event_correlation_fails_closed(tmp_path) -> None:
    cookies_file = write_inventory(tmp_path, [account("only")])
    db_path = tmp_path / "state.db"
    result = execute_account_check(
        AccountCheckConfig(cookies_file, db_path, 1),
        fake_scweet_factory(request_delta=1, fetched_count=1),
    )
    assert result["status"] == "passed"
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT request_id, scan_job_id, source_binding_id,
                   pass_observation_id, collector_run_id
            FROM account_usage_events WHERE event_type = 'pass_succeeded'
            """,
        ).fetchone()
        connection.execute(
            """
            UPDATE account_usage_events SET collector_run_id = 'wrong-run'
            WHERE event_type = 'pass_succeeded'
            """,
        )
    context = EvidenceContext(*row)

    with pytest.raises(EvidenceFailure, match="run_correlation_mismatch"):
        validate_account_evidence(db_path, context)


@pytest.mark.parametrize(
    "event_type",
    ["pass_started", "pass_succeeded", "account_state_delta_observed"],
)
def test_every_event_rejects_foreign_or_reused_request_id(
    tmp_path,
    event_type: str,
) -> None:
    cookies_file = write_inventory(tmp_path, [account("only")])
    db_path = tmp_path / "state.db"
    result = execute_account_check(
        AccountCheckConfig(cookies_file, db_path, 1),
        fake_scweet_factory(request_delta=1, fetched_count=1),
    )
    context = EvidenceContext(
        result["requestId"],
        result["scanJobId"],
        result["sourceBindingId"],
        result["passObservationId"],
        result["collectorRunId"],
    )
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "UPDATE account_usage_events SET request_id = ? WHERE event_type = ?",
            ("x-production-canary-request-2", event_type),
        )

    with pytest.raises(EvidenceFailure, match="event_correlation_mismatch"):
        validate_account_evidence(db_path, context)


@pytest.mark.parametrize("request_delta", [0, 3])
def test_request_budget_must_be_one_or_two(tmp_path, request_delta: int) -> None:
    cookies_file = write_inventory(tmp_path, [account("only")])

    result = execute_account_check(
        AccountCheckConfig(cookies_file, tmp_path / "state.db", 1),
        fake_scweet_factory(request_delta=request_delta, fetched_count=1),
    )

    assert result["status"] == "failed"
    assert result["reasonCode"] in {"state_delta_invalid", "request_budget_invalid"}


def test_fetched_count_cannot_exceed_fixed_limit(tmp_path) -> None:
    cookies_file = write_inventory(tmp_path, [account("only")])

    result = execute_account_check(
        AccountCheckConfig(cookies_file, tmp_path / "state.db", 1),
        fake_scweet_factory(request_delta=1, fetched_count=2),
    )

    assert result["status"] == "failed"
    assert result["reasonCode"] == "pass_counts_invalid"


@pytest.mark.parametrize(
    ("column_update", "reason_code"),
    [
        ("status = 401", "account_terminal_unhealthy"),
        (
            "available_til = 4102444800, cooldown_reason = 'rate_limit'",
            "account_terminal_unhealthy",
        ),
    ],
)
def test_auth_and_cooldown_terminal_state_fail_closed(
    tmp_path,
    column_update: str,
    reason_code: str,
) -> None:
    cookies_file = write_inventory(tmp_path, [account("only")])
    db_path = tmp_path / "state.db"
    result = execute_account_check(
        AccountCheckConfig(cookies_file, db_path, 1),
        fake_scweet_factory(request_delta=1, fetched_count=1),
    )
    context = EvidenceContext(
        result["requestId"],
        result["scanJobId"],
        result["sourceBindingId"],
        result["passObservationId"],
        result["collectorRunId"],
    )
    with sqlite3.connect(db_path) as connection:
        connection.execute(f"UPDATE accounts SET {column_update}")

    with pytest.raises(EvidenceFailure, match=reason_code):
        validate_account_evidence(db_path, context)


def test_failure_or_rate_limit_event_fails_closed(tmp_path) -> None:
    cookies_file = write_inventory(tmp_path, [account("only")])
    db_path = tmp_path / "state.db"
    result = execute_account_check(
        AccountCheckConfig(cookies_file, db_path, 1),
        fake_scweet_factory(request_delta=1, fetched_count=1),
    )
    context = EvidenceContext(
        result["requestId"],
        result["scanJobId"],
        result["sourceBindingId"],
        result["passObservationId"],
        result["collectorRunId"],
    )
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            UPDATE account_usage_events SET failure_kind = 'rate_limit'
            WHERE event_type = 'account_state_delta_observed'
            """,
        )

    with pytest.raises(EvidenceFailure, match="failure_or_cooldown_observed"):
        validate_account_evidence(db_path, context)


def test_all_zero_fetched_is_inconclusive_content() -> None:
    results = [passed_account(ordinal, fetched_count=0) for ordinal in range(1, 5)]

    aggregate = aggregate_results(results, "a" * 40, "sha256:" + "b" * 64)

    assert aggregate["schemaVersion"] == SCHEMA_VERSION
    assert aggregate["status"] == "inconclusive_content"
    assert aggregate["reasonCode"] == "all_accounts_zero_fetched"
    assert aggregate["totalFetchedCount"] == 0


def test_exact_four_happy_aggregate_is_allowlisted_and_warning_only() -> None:
    results = [passed_account(ordinal, int(ordinal == 1)) for ordinal in range(1, 5)]

    aggregate = aggregate_results(results, "a" * 40, "sha256:" + "b" * 64)

    assert aggregate["status"] == "passed"
    assert aggregate["collectionAttempted"] is True
    assert aggregate["observedAccountCount"] == 4
    assert aggregate["warningCodes"] == ["attribution_unknown"]
    serialized = json.dumps(aggregate)
    for forbidden in ("username", "cookie", "auth_token", "fingerprint", "errors"):
        assert forbidden not in serialized


@pytest.mark.parametrize(
    "identifier_key",
    ["requestId", "scanJobId", "passObservationId", "collectorRunId"],
)
def test_aggregate_rejects_reused_correlation_identifiers(identifier_key: str) -> None:
    results = [passed_account(ordinal, 1) for ordinal in range(1, 5)]
    results[3][identifier_key] = results[0][identifier_key]

    aggregate = aggregate_results(results, "a" * 40, "sha256:" + "b" * 64)

    assert aggregate["status"] == "failed"
    assert aggregate["reasonCode"] == "correlation_identifier_reused"


def test_malformed_args_redact_unknown_values(capsys) -> None:
    sentinel = "DO_NOT_DISCLOSE_ARGUMENT_VALUE"

    assert canary_main([f"--auth-token={sentinel}"]) == EX_USAGE

    output = capsys.readouterr()
    assert sentinel not in output.out
    assert sentinel not in output.err
    assert json.loads(output.out)["reasonCode"] == "invalid_arguments"


def test_result_validator_rejects_secret_bearing_unallowlisted_values(tmp_path) -> None:
    result = passed_account(1, 1)
    result["warningCodes"] = ["DO_NOT_DISCLOSE_RESULT_SECRET"]
    result_file = tmp_path / "result.json"
    result_file.write_text(json.dumps(result), encoding="utf-8")

    assert canary_main(["validate-result", "--result-file", str(result_file)]) == EX_DATAERR


def test_default_scweet_is_hard_bounded_and_has_no_env_or_token(monkeypatch, tmp_path) -> None:
    captured: dict[str, object] = {}

    class FakeConfig:
        def __init__(self, **kwargs: object) -> None:
            captured["config"] = kwargs

    class FakeScweet:
        def __init__(self, **kwargs: object) -> None:
            captured["scweet"] = kwargs

    monkeypatch.setitem(
        sys.modules,
        "Scweet",
        SimpleNamespace(Scweet=FakeScweet, ScweetConfig=FakeConfig),
    )
    config = AccountCheckConfig(tmp_path / "cookies.json", tmp_path / "state.db", 1)

    build_scweet(config)

    assert captured["config"] == {
        "daily_requests_limit": MAX_REQUESTS_PER_ACCOUNT,
        "daily_tweets_limit": 100,
        "requests_per_min": 2,
        "min_delay_s": 2.0,
        "n_splits": 1,
        "api_page_size": 1,
        "max_empty_pages": 1,
    }
    assert captured["scweet"] == {
        "cookies_file": str(config.cookies_file),
        "auth_token": None,
        "db_path": str(config.db_path),
        "proxy": None,
        "manifest_scrape_on_init": False,
        "config": ANY,
        "provision": True,
    }


def write_inventory(tmp_path: Path, payload) -> Path:
    cookies_file = tmp_path / "cookies.json"
    cookies_file.write_text(json.dumps(payload), encoding="utf-8")
    return cookies_file


def passed_account(account_ordinal: int, fetched_count: int) -> dict[str, object]:
    return {
        "status": "passed",
        "reasonCode": "account_passed",
        "accountOrdinal": account_ordinal,
        "collectionAttempted": True,
        "requestDelta": 1,
        "fetchedCount": fetched_count,
        "runCompleted": True,
        "correlationVerified": True,
        "attributionStatus": "unknown",
        "warningCodes": ["attribution_unknown"],
        "requestId": f"request-{account_ordinal}",
        "scanJobId": f"scan-{account_ordinal}",
        "sourceBindingId": f"binding-{account_ordinal}",
        "passObservationId": f"pass-{account_ordinal}",
        "collectorRunId": f"run-{account_ordinal}",
    }


def fake_scweet_factory(request_delta: int, fetched_count: int):
    def factory(config: AccountCheckConfig):
        create_scweet_database(config.db_path)
        return FakeScweet(config.db_path, request_delta, fetched_count)

    return factory


class FakeScweet:
    def __init__(self, db_path: Path, request_delta: int, fetched_count: int) -> None:
        self.db_path = db_path
        self.request_delta = request_delta
        self.fetched_count = fetched_count

    def search(self, query: str, **kwargs: object) -> list[dict[str, object]]:
        assert query == FIXED_QUERY
        assert kwargs["limit"] == 1
        assert kwargs["save"] is False
        assert kwargs["resume"] is False
        now = datetime.now(UTC).timestamp()
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                """
                UPDATE accounts
                SET daily_requests = daily_requests + ?,
                    daily_tweets = daily_tweets + ?
                """,
                (self.request_delta, self.fetched_count),
            )
            connection.execute(
                """
                INSERT INTO runs (run_id, status, started_at, finished_at, stats_json)
                VALUES ('fixture-run', 'completed', ?, ?, '{}')
                """,
                (now - 1, now),
            )
        return [{"fixture": True} for _ in range(self.fetched_count)]


def create_scweet_database(db_path: Path) -> None:
    today = datetime.now(UTC).date().isoformat()
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE accounts (
              id INTEGER PRIMARY KEY,
              username TEXT NOT NULL,
              status INTEGER NOT NULL,
              daily_requests INTEGER NOT NULL,
              daily_tweets INTEGER NOT NULL,
              last_reset_date TEXT,
              available_til REAL,
              lease_id TEXT,
              lease_expires_at REAL,
              busy INTEGER NOT NULL,
              cooldown_reason TEXT,
              last_used REAL
            )
            """,
        )
        connection.execute(
            """
            INSERT INTO accounts VALUES
            (1, 'fixture-account', 1, 0, 0, ?, NULL, NULL, NULL, 0, NULL, NULL)
            """,
            (today,),
        )
        connection.execute(
            """
            CREATE TABLE runs (
              run_id TEXT PRIMARY KEY,
              status TEXT NOT NULL,
              started_at REAL NOT NULL,
              finished_at REAL,
              stats_json TEXT
            )
            """,
        )
