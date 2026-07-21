from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest


SCRIPT = Path(__file__).parents[1] / "bin" / "run-production-canary.sh"
EXPECTED_SHA = "a" * 40
IMAGE_ID = "sha256:" + "b" * 64
SCHEMA_VERSION = "x-production-account-canary.v1"
ACCOUNT_SET_REASON = "x_canary.account_set_not_exactly_four"
INVENTORY_UNAVAILABLE_REASON = "x_canary.account_inventory_unavailable"


def account(name: str, token: str | None = None) -> dict[str, str]:
    return {
        "username": name,
        "auth_token": token or f"fixture-auth-{name}",
        "ct0": f"fixture-csrf-{name}",
    }


def test_plan_is_read_only_and_uses_only_network_none_inventory(tmp_path) -> None:
    fixture = host_fixture(tmp_path)
    invalid_fixture = host_fixture(tmp_path / "invalid")

    completed = fixture.run("plan")
    forbidden_output = invalid_fixture.root / "plan-output.json"
    invalid = invalid_fixture.run(
        "plan",
        extra_arguments=["--output", str(forbidden_output)],
    )

    assert completed.returncode == 0
    assert json.loads(completed.stdout) == {
        "schemaVersion": SCHEMA_VERSION,
        "status": "ready",
        "reasonCode": "x_canary.account_set_ready",
        "requiredAccountCount": 4,
        "observedAccountCount": 4,
        "collectionAttempted": False,
    }
    runs = fixture.docker_runs()
    assert len(runs) == 1
    assert "--network=none" in runs[0]
    assert "x_collector.canary_account_inventory" in runs[0]
    assert not fixture.flock_log.exists()
    assert invalid.returncode == 64
    assert not forbidden_output.exists()
    assert not invalid_fixture.docker_log.exists()


@pytest.mark.parametrize(
    ("payload", "reason_code", "observed_count"),
    [
        ([], ACCOUNT_SET_REASON, 0),
        ([account("one")], ACCOUNT_SET_REASON, 1),
        ([account("one"), account("two")], ACCOUNT_SET_REASON, 2),
        ([account("one"), account("two"), account("three")], ACCOUNT_SET_REASON, 3),
        ([account(str(index)) for index in range(5)], ACCOUNT_SET_REASON, 5),
        (
            [account("one"), account("two"), account("three"), account("one")],
            ACCOUNT_SET_REASON,
            3,
        ),
        (
            [
                account("one", "shared"),
                account("two"),
                account("three"),
                account("four", "shared"),
            ],
            ACCOUNT_SET_REASON,
            3,
        ),
        ("malformed", INVENTORY_UNAVAILABLE_REASON, 0),
        (
            [
                {"username": name, "cookies": {"lang": "en"}}
                for name in ("one", "two", "three", "four")
            ],
            INVENTORY_UNAVAILABLE_REASON,
            0,
        ),
    ],
)
def test_non_exact_or_malformed_inventory_has_no_network_capable_call(
    tmp_path,
    payload,
    reason_code: str,
    observed_count: int,
) -> None:
    fixture = host_fixture(tmp_path, payload=payload)

    completed = fixture.run()

    assert completed.returncode == 78
    assert json.loads(completed.stdout) == {
        "schemaVersion": SCHEMA_VERSION,
        "status": "blocked",
        "reasonCode": reason_code,
        "requiredAccountCount": 4,
        "observedAccountCount": observed_count,
        "collectionAttempted": False,
    }
    assert all("--network=none" in run for run in fixture.docker_runs())
    assert not fixture.network_capable_runs()
    assert not fixture.flock_log.exists()


def test_shared_nested_credentials_block_despite_unique_top_level_credentials(
    tmp_path,
) -> None:
    payload = [account(name) for name in ("one", "two", "three", "four")]
    for item in payload:
        item["cookies"] = {
            "authToken": "shared-nested-auth",
            "csrf_token": "shared-nested-csrf",
        }
    fixture = host_fixture(tmp_path, payload=payload)

    completed = fixture.run()

    assert completed.returncode == 78
    assert json.loads(completed.stdout) == {
        "schemaVersion": SCHEMA_VERSION,
        "status": "blocked",
        "reasonCode": INVENTORY_UNAVAILABLE_REASON,
        "requiredAccountCount": 4,
        "observedAccountCount": 0,
        "collectionAttempted": False,
    }
    assert fixture.docker_runs()
    assert all("--network=none" in run for run in fixture.docker_runs())
    assert not fixture.network_capable_runs()
    assert not fixture.flock_log.exists()


def test_conflicting_shared_alias_blocks_before_network_capable_call(tmp_path) -> None:
    payload = [account(f"label-{ordinal}") for ordinal in range(1, 5)]
    for item in payload:
        item["screen_name"] = "@same-real-handle"
    fixture = host_fixture(tmp_path, payload=payload)

    completed = fixture.run()

    assert completed.returncode == 78
    assert json.loads(completed.stdout) == {
        "schemaVersion": SCHEMA_VERSION,
        "status": "blocked",
        "reasonCode": INVENTORY_UNAVAILABLE_REASON,
        "requiredAccountCount": 4,
        "observedAccountCount": 0,
        "collectionAttempted": False,
    }
    assert fixture.docker_runs()
    assert all("--network=none" in run for run in fixture.docker_runs())
    assert not fixture.network_capable_runs()
    assert not fixture.flock_log.exists()


def test_exact_four_is_sequential_hardened_isolated_and_env_clean(tmp_path) -> None:
    fixture = host_fixture(tmp_path)

    completed = fixture.run(
        environment={
            "DATABASE_URL": "SENTINEL_PRODUCTION_DATABASE",
            "X_COLLECTOR_SERVICE_TOKEN": "SENTINEL_SERVICE_TOKEN",
            "UNRELATED_SECRET": "SENTINEL_ENVIRONMENT_SECRET",
        },
    )

    assert completed.returncode == 0
    payload = json.loads(completed.stdout)
    assert payload["schemaVersion"] == SCHEMA_VERSION
    assert payload["status"] == "passed"
    assert payload["observedAccountCount"] == 4
    assert payload["totalFetchedCount"] == 1
    collection_runs = fixture.collection_runs()
    assert [option_value(run, "--account-ordinal") for run in collection_runs] == [
        "1",
        "2",
        "3",
        "4",
    ]
    for run in collection_runs:
        serialized = " ".join(run)
        assert str(fixture.cookies_file) not in serialized
        assert "production.db" not in serialized
        assert "DATABASE_URL" not in serialized
        assert "X_COLLECTOR_SERVICE_TOKEN" not in serialized
        assert "--env" not in run
        assert "--env-file" not in run
        assert "--read-only" in run
        assert "--pull=never" in run
        assert "--cap-drop=ALL" in run
        assert "--security-opt=no-new-privileges" in run
        assert "--network=bridge" in run
        assert "/canary/scweet-state.db" in run
        assert "/run/x-canary/cookies.json" in serialized
        assert "-i" in run
        assert "--user=65532:65532" in run
        assert any("uid=65532,gid=65532,mode=0700" in value for value in run)
    for run in fixture.docker_runs():
        assert "--user=65532:65532" in run
    for call in fixture.docker_calls():
        assert set(call["env"]).issubset({"PATH", "LC_CTYPE"})
        assert not any("SENTINEL" in value for value in call["env"].values())
    assert "SENTINEL" not in completed.stdout
    assert "SENTINEL" not in completed.stderr
    assert not any(Path(path).exists() for path in fixture.canary_temp_paths())


@pytest.mark.parametrize(
    ("config", "reason_code"),
    [
        ({"markerSha": "c" * 40}, "deployed_sha_marker_mismatch"),
        ({"imageFail": True}, "image_unavailable"),
        ({"imageSha": "c" * 40}, "image_sha_mismatch"),
        ({"currentImageId": "sha256:" + "c" * 64}, "deployed_image_mismatch"),
        ({"serviceLabel": "api"}, "deployed_container_mismatch"),
        ({"running": False}, "health_unavailable"),
        ({"health": "unhealthy"}, "health_unavailable"),
    ],
)
def test_deployed_marker_image_and_health_fail_before_inventory_or_collection(
    tmp_path,
    config: dict[str, object],
    reason_code: str,
) -> None:
    fixture = host_fixture(tmp_path, config=config)

    completed = fixture.run()

    assert completed.returncode == 78
    assert json.loads(completed.stdout)["reasonCode"] == reason_code
    assert not fixture.network_capable_runs()
    if "markerSha" in config:
        assert not fixture.docker_log.exists()


@pytest.mark.parametrize(
    ("failure_call", "reason_code"),
    [
        (1, "deploy_lock_unavailable"),
        (2, "daily_priority_active"),
        (3, "daily_lock_unavailable"),
        (4, "daily_priority_active"),
        (5, "canary_lock_unavailable"),
        (6, "live_scweet_lock_unavailable"),
        (7, "daily_priority_active"),
    ],
)
def test_lock_order_and_every_lock_failure_are_fail_closed(
    tmp_path,
    failure_call: int,
    reason_code: str,
) -> None:
    fixture = host_fixture(tmp_path, config={"flockFailCall": failure_call})

    completed = fixture.run()

    assert completed.returncode == 78
    assert json.loads(completed.stdout)["reasonCode"] == reason_code
    assert not fixture.network_capable_runs()
    expected_order = ["9", "7", "8", "7", "6", "5", "7"][:failure_call]
    assert [call["fd"] for call in fixture.flock_calls()] == expected_order


def test_locked_recheck_catches_inventory_race_after_live_lock(tmp_path) -> None:
    fixture = host_fixture(tmp_path, config={"flockMutateCall": 6})

    completed = fixture.run()

    assert completed.returncode == 78
    payload = json.loads(completed.stdout)
    assert payload["reasonCode"] == ACCOUNT_SET_REASON
    assert payload["observedAccountCount"] == 2
    inventory_runs = [
        run
        for run in fixture.docker_runs()
        if "x_collector.canary_account_inventory" in run
    ]
    assert len(inventory_runs) == 2
    assert all("--network=none" in run for run in inventory_runs)
    assert not fixture.network_capable_runs()


@pytest.mark.parametrize(
    ("config", "reason_code"),
    [
        ({"flockMarkerMutateCall": 7}, "deployed_sha_marker_mismatch"),
        (
            {
                "flockRuntimeMutateCall": 7,
                "runtimeMutation": {"imageId": "sha256:" + "c" * 64},
            },
            "image_identity_changed",
        ),
        (
            {
                "flockRuntimeMutateCall": 7,
                "runtimeMutation": {"health": "unhealthy"},
            },
            "health_unavailable",
        ),
    ],
)
def test_locked_recheck_catches_identity_race_before_locked_inventory(
    tmp_path,
    config: dict[str, object],
    reason_code: str,
) -> None:
    fixture = host_fixture(tmp_path, config=config)

    completed = fixture.run()

    assert completed.returncode == 78
    assert json.loads(completed.stdout)["reasonCode"] == reason_code
    inventory_runs = [
        run
        for run in fixture.docker_runs()
        if "x_collector.canary_account_inventory" in run
    ]
    assert len(inventory_runs) == 1
    assert not fixture.network_capable_runs()


@pytest.mark.parametrize(
    "reason_code",
    ["collection_failed", "auth_failed", "rate_limit", "cooldown", "request_budget_invalid"],
)
def test_any_account_failure_stops_before_remaining_accounts(
    tmp_path,
    reason_code: str,
) -> None:
    fixture = host_fixture(
        tmp_path,
        config={"failureOrdinal": 2, "failureReason": reason_code},
    )

    completed = fixture.run()

    assert completed.returncode == 65
    assert json.loads(completed.stdout)["status"] == "failed"
    assert [option_value(run, "--account-ordinal") for run in fixture.collection_runs()] == [
        "1",
        "2",
    ]


def test_timeout_stops_collection_and_forces_named_container_cleanup(tmp_path) -> None:
    fixture = host_fixture(tmp_path, config={"timeoutOrdinal": 2})

    completed = fixture.run()

    assert completed.returncode == 65
    assert [option_value(run, "--account-ordinal") for run in fixture.collection_runs()] == [
        "1",
        "2",
    ]
    cleanup_calls = [
        call["argv"]
        for call in fixture.docker_calls()
        if call["argv"][:2] == ["rm", "-f"]
    ]
    assert cleanup_calls
    assert any(
        call[-1].startswith("x-production-canary-account-2-")
        for call in cleanup_calls
    )


def test_malformed_args_and_process_stderr_never_leak_secrets(tmp_path) -> None:
    fixture = host_fixture(
        tmp_path,
        config={"imageFail": True, "secretStderr": "DO_NOT_DISCLOSE_PROCESS_SECRET"},
    )

    completed = fixture.run()

    assert "DO_NOT_DISCLOSE_PROCESS_SECRET" not in completed.stdout
    assert "DO_NOT_DISCLOSE_PROCESS_SECRET" not in completed.stderr
    sentinel = "DO_NOT_DISCLOSE_ARGUMENT_SECRET"
    malformed = subprocess.run(
        ["/usr/bin/bash", str(SCRIPT), "run", f"--auth-token={sentinel}"],
        text=True,
        capture_output=True,
        check=False,
    )
    assert malformed.returncode == 64
    assert sentinel not in malformed.stdout
    assert sentinel not in malformed.stderr
    assert set(json.loads(malformed.stdout)) == {
        "schemaVersion",
        "status",
        "reasonCode",
        "requiredAccountCount",
        "observedAccountCount",
        "collectionAttempted",
    }


def test_all_zero_results_are_inconclusive_and_bad_correlation_fails(tmp_path) -> None:
    zero_fixture = host_fixture(tmp_path / "zero", config={"allZero": True})
    duplicate_fixture = host_fixture(
        tmp_path / "duplicate",
        config={"duplicateIdKey": "collectorRunId"},
    )

    zero = zero_fixture.run()
    duplicate = duplicate_fixture.run()

    assert zero.returncode == 75
    assert json.loads(zero.stdout)["reasonCode"] == "all_accounts_zero_fetched"
    assert duplicate.returncode == 65
    assert json.loads(duplicate.stdout)["reasonCode"] == "correlation_identifier_reused"


def test_live_scweet_lock_is_production_sidecar_and_test_sidecar_is_distinct(
    tmp_path,
) -> None:
    fixture = host_fixture(tmp_path)

    completed = fixture.run()

    assert completed.returncode == 0
    script = SCRIPT.read_text(encoding="utf-8")
    assert (
        "/var/data/social-monitor/runtime/x-collector/"
        "scweet_state.db.social-monitor-run.lock"
    ) in script
    assert "x-collector-scweet-live.lock" not in script
    assert "trap cleanup EXIT" in script
    assert "trap on_signal HUP INT TERM" in script
    assert "DOCKER_RUN_TIMEOUT_SECONDS=120" in script
    assert (fixture.control_dir / "scweet_state.db.social-monitor-run.lock").exists()
    assert all("/canary/scweet-state.db" in run for run in fixture.collection_runs())


def test_arbitrary_control_dir_blocks_before_fixture_docker(tmp_path) -> None:
    fixture = host_fixture(tmp_path)

    completed = fixture.run(use_fixture_capability=False)

    assert completed.returncode == 78
    assert json.loads(completed.stdout)["reasonCode"] == "production_control_dir_required"
    assert not fixture.docker_log.exists()


def test_root_caller_still_uses_fixed_non_root_identity(tmp_path) -> None:
    if os.geteuid() != 0:
        pytest.skip("root caller regression requires a root test process")
    fixture = host_fixture(tmp_path)

    completed = fixture.run()

    assert completed.returncode == 0
    assert fixture.docker_runs()
    assert all("--user=65532:65532" in run for run in fixture.docker_runs())


class HostFixture:
    def __init__(self, root: Path, payload, config: dict[str, object]) -> None:
        self.root = root
        self.fake_bin = root / "bin"
        self.control_dir = root / "control"
        self.cookies_file = root / "production-cookies.json"
        self.docker_log = self.fake_bin / "docker-log.jsonl"
        self.flock_log = self.fake_bin / "flock-log.jsonl"
        self.fake_bin.mkdir(parents=True)
        (self.control_dir / "deploy-state").mkdir(parents=True)
        self.cookies_file.write_text(json.dumps(payload), encoding="utf-8")
        merged = {
            "expectedSha": EXPECTED_SHA,
            "markerSha": EXPECTED_SHA,
            "imageId": IMAGE_ID,
            "imageSha": EXPECTED_SHA,
            "currentImageId": IMAGE_ID,
            "serviceLabel": "x-collector",
            "running": True,
            "health": "healthy",
            "allZero": False,
            "imageFail": False,
            "failureOrdinal": 0,
            "failureReason": "collection_failed",
            "timeoutOrdinal": 0,
            "hangOrdinal": 0,
            "flockFailCall": 0,
            "flockMutateCall": 0,
            "flockMarkerMutateCall": 0,
            "flockRuntimeMutateCall": 0,
            "runtimeMutation": {},
            "duplicateIdKey": "",
            "cookiesFile": str(self.cookies_file),
            "markerFile": str(self.control_dir / "deploy-state" / "backend.sha"),
            "mutatedPayload": [account("one"), account("two")],
        }
        merged.update(config)
        (self.control_dir / "deploy-state" / "backend.sha").write_text(
            str(merged["markerSha"]) + "\n",
            encoding="utf-8",
        )
        (self.fake_bin / "config.json").write_text(json.dumps(merged), encoding="utf-8")
        write_executable(self.fake_bin / "docker", fake_docker_script())
        write_executable(self.fake_bin / "flock", fake_flock_script())

    def run(
        self,
        action: str = "run",
        environment: dict[str, str] | None = None,
        extra_arguments: list[str] | None = None,
        use_fixture_capability: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        process_environment = os.environ.copy()
        process_environment.update(environment or {})
        process_environment["PATH"] = f"{self.fake_bin}:/usr/bin:/bin"
        arguments = [
                "/usr/bin/bash",
                str(SCRIPT),
                action,
                "--expected-sha",
                EXPECTED_SHA,
                "--image",
                "fixture/x-collector:canary",
                "--cookies-file",
                str(self.cookies_file),
                "--control-dir",
                str(self.control_dir),
                "--health-container",
                "fixture-x-collector",
            ]
        arguments.extend(extra_arguments or [])
        fixture_fd = -1
        pass_fds: tuple[int, ...] = ()
        if use_fixture_capability:
            fixture_fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
            process_environment["X_CANARY_TEST_FIXTURE_FD"] = str(fixture_fd)
            pass_fds = (fixture_fd,)
        else:
            process_environment.pop("X_CANARY_TEST_FIXTURE_FD", None)
        try:
            return subprocess.run(
                arguments,
                env=process_environment,
                pass_fds=pass_fds,
                text=True,
                capture_output=True,
                check=False,
            )
        finally:
            if fixture_fd >= 0:
                os.close(fixture_fd)

    def docker_calls(self) -> list[dict[str, object]]:
        return read_json_lines(self.docker_log)

    def docker_runs(self) -> list[list[str]]:
        return [call["argv"] for call in self.docker_calls() if call["argv"][:1] == ["run"]]

    def network_capable_runs(self) -> list[list[str]]:
        return [run for run in self.docker_runs() if "--network=bridge" in run]

    def collection_runs(self) -> list[list[str]]:
        return [
            run
            for run in self.network_capable_runs()
            if "x_collector.production_canary" in run and "run" in run
        ]

    def flock_calls(self) -> list[dict[str, object]]:
        return read_json_lines(self.flock_log)

    def canary_temp_paths(self) -> set[str]:
        paths: set[str] = set()
        for run in self.docker_runs():
            for argument in run:
                if argument.startswith("type=bind,src=/dev/shm/x-production-canary."):
                    paths.add(argument.split(",dst=", 1)[0].removeprefix("type=bind,src="))
        return paths


def host_fixture(
    tmp_path: Path,
    payload=None,
    config: dict[str, object] | None = None,
) -> HostFixture:
    return HostFixture(
        tmp_path,
        payload
        if payload is not None
        else [account("one"), account("two"), account("three"), account("four")],
        config or {},
    )


def option_value(arguments: list[str], option: str) -> str:
    return arguments[arguments.index(option) + 1]


def read_json_lines(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def fake_docker_script() -> str:
    return r'''#!/usr/bin/python3
import json
import os
import sys
import time
from pathlib import Path

root = Path(__file__).parent
config = json.loads((root / "config.json").read_text())
args = sys.argv[1:]
with (root / "docker-log.jsonl").open("a") as stream:
    stream.write(json.dumps({"argv": args, "env": dict(os.environ)}, sort_keys=True) + "\n")

def output(value):
    print(value, flush=True)

def option(name, default=""):
    return args[args.index(name) + 1] if name in args else default

def mounts():
    resolved = {}
    for value in args:
        if value.startswith("type=bind,src=") and ",dst=" in value:
            source, destination = value.split(",dst=", 1)
            resolved[destination.split(",", 1)[0]] = source.removeprefix("type=bind,src=")
    return resolved

def inventory_payload(payload):
    if not isinstance(payload, list):
        return False, 0, "x_canary.account_inventory_unavailable"
    auth_names = {"auth_token", "authtoken", "token"}
    csrf_names = {"ct0", "csrf", "csrf_token"}
    cookie_container_names = ("cookies", "cookies_json", "cookie_jar", "cookieJar")

    def representation(auth_values, csrf_values):
        if not auth_values and not csrf_values:
            return None, False
        if len(auth_values) != 1 or len(csrf_values) != 1:
            return None, True
        auth_token, csrf_token = auth_values[0], csrf_values[0]
        if (
            not isinstance(auth_token, str)
            or not auth_token.strip()
            or not isinstance(csrf_token, str)
            or not csrf_token.strip()
        ):
            return None, True
        return (auth_token.strip(), csrf_token.strip()), False

    def nested_representation(value):
        auth_values = []
        csrf_values = []
        if isinstance(value, dict):
            items = value.items()
        elif isinstance(value, list):
            if any(not isinstance(item, dict) for item in value):
                return None, True
            items = ((item.get("name"), item.get("value")) for item in value)
        else:
            return None, True
        for name, token in items:
            normalized_name = str(name).strip().casefold()
            if normalized_name in auth_names:
                auth_values.append(token)
            elif normalized_name in csrf_names:
                csrf_values.append(token)
        resolved, malformed = representation(auth_values, csrf_values)
        if resolved is None and not malformed and bool(value):
            return None, True
        return resolved, malformed

    def auth_source(item):
        top_level, malformed = representation(
            [item[key] for key in ("auth_token", "authToken", "token") if key in item],
            [item[key] for key in ("ct0", "csrf", "csrf_token") if key in item],
        )
        sources = [] if top_level is None else [top_level]
        for key in cookie_container_names:
            if key not in item:
                continue
            nested, nested_malformed = nested_representation(item[key])
            malformed = malformed or nested_malformed
            if nested is not None:
                sources.append(nested)
        if malformed or len(sources) != 1:
            return None
        return sources[0]

    identities = []
    credential_sources = []
    malformed = False
    for item in payload:
        if not isinstance(item, dict):
            malformed = True
            continue
        aliases = []
        for key in ("username", "screen_name", "handle", "account_name"):
            if key not in item:
                continue
            value = item[key]
            if not isinstance(value, str):
                aliases = []
                malformed = True
                break
            normalized = value.strip().lstrip("@").casefold()
            if (
                not normalized
                or len(normalized) > 64
                or any(character.isspace() for character in normalized)
            ):
                aliases = []
                malformed = True
                break
            aliases.append(normalized)
        if not aliases or len(set(aliases)) != 1:
            malformed = True
            continue
        source = auth_source(item)
        if source is None:
            malformed = True
            continue
        identities.append(aliases[0])
        credential_sources.append(set(source))
    parents = list(range(len(identities)))
    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index
    for left in range(len(identities)):
        for right in range(left):
            if (
                identities[left] == identities[right]
                or not credential_sources[left].isdisjoint(
                    credential_sources[right]
                )
            ):
                parents[root(left)] = root(right)
    observed = len({root(index) for index in range(len(identities))})
    if malformed:
        return False, observed, "x_canary.account_inventory_unavailable"
    if len(payload) != 4 or observed != 4:
        return False, observed, "x_canary.account_set_not_exactly_four"
    return True, 4, "x_canary.account_set_ready"

def inventory_wire(ready, observed, reason):
    return json.dumps({
        "schemaVersion": "x-production-account-canary.v1",
        "status": "ready" if ready else "blocked",
        "reasonCode": reason,
        "requiredAccountCount": 4,
        "observedAccountCount": observed,
        "collectionAttempted": False,
    }, sort_keys=True, separators=(",", ":"))

if args[:1] == ["image"]:
    if config.get("imageFail"):
        print(config.get("secretStderr", "image failure"), file=sys.stderr)
        raise SystemExit(1)
    template = option("--format")
    output(config["imageSha"] if "revision" in template else config["imageId"])
    raise SystemExit(0)

if args[:1] == ["inspect"]:
    template = option("--format")
    if template == "{{.Image}}":
        output(config["currentImageId"])
    elif "com.docker.compose.service" in template:
        output(config["serviceLabel"])
    elif template == "{{.State.Running}}":
        output("true" if config["running"] else "false")
    else:
        output(config["health"])
    raise SystemExit(0)

if args[:1] == ["rm"]:
    raise SystemExit(0)

if args[:1] != ["run"]:
    raise SystemExit(2)

mounted = mounts()
if "x_collector.canary_account_inventory" in args:
    payload = json.loads(Path(mounted["/run/x-canary/cookies.json"]).read_text())
    ready, observed, reason = inventory_payload(payload)
    action = args[args.index("x_collector.canary_account_inventory") + 1]
    if ready and action == "prepare":
        output_root = Path(mounted["/canary-host"]) / "accounts"
        output_root.mkdir(mode=0o700)
        for ordinal, item in enumerate(payload, start=1):
            destination = output_root / f"account-{ordinal}.json"
            descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as stream:
                json.dump([item], stream, separators=(",", ":"))
    output(inventory_wire(ready, observed, reason))
    raise SystemExit(0 if ready else 78)

if "x_collector.production_canary" not in args:
    raise SystemExit(2)
action = args[args.index("x_collector.production_canary") + 1]
if action == "run":
    ordinal = int(option("--account-ordinal"))
    failed = ordinal == int(config.get("failureOrdinal", 0))
    timeout = ordinal == int(config.get("timeoutOrdinal", 0))
    hang = ordinal == int(config.get("hangOrdinal", 0))
    if hang:
        time.sleep(60)
    if timeout:
        raise SystemExit(124)
    values = {
        "status": "failed" if failed else "passed",
        "reasonCode": config["failureReason"] if failed else "account_passed",
        "accountOrdinal": ordinal,
        "collectionAttempted": True,
        "requestDelta": 0 if failed else 1,
        "fetchedCount": 0 if config["allZero"] or ordinal != 1 or failed else 1,
        "runCompleted": not failed,
        "correlationVerified": not failed,
        "attributionStatus": "unknown",
        "warningCodes": [] if failed else ["attribution_unknown"],
        "requestId": "" if failed else f"request-{ordinal}",
        "scanJobId": "" if failed else f"scan-{ordinal}",
        "sourceBindingId": "" if failed else f"binding-{ordinal}",
        "passObservationId": "" if failed else f"pass-{ordinal}",
        "collectorRunId": "" if failed else f"run-{ordinal}",
    }
    duplicate_key = config.get("duplicateIdKey")
    if ordinal == 4 and duplicate_key:
        values[duplicate_key] = values[duplicate_key].replace("4", "1")
    output(json.dumps(values, sort_keys=True, separators=(",", ":")))
    raise SystemExit(65 if failed else 0)

if action == "validate-result":
    result = json.loads(Path(mounted["/run/x-canary/result.json"]).read_text())
    raise SystemExit(0 if result.get("status") == "passed" else 65)

if action == "aggregate":
    results = []
    invalid = False
    for path in sorted(Path(mounted["/run/x-canary/results"]).glob("account-*.json")):
        try:
            results.append(json.loads(path.read_text()))
        except Exception:
            invalid = True
    ordinals = sorted(
        result.get("accountOrdinal")
        for result in results
        if isinstance(result, dict)
    )
    all_passed = (
        not invalid
        and ordinals == [1, 2, 3, 4]
        and all(result.get("status") == "passed" for result in results)
    )
    correlation_keys = (
        "requestId",
        "scanJobId",
        "sourceBindingId",
        "passObservationId",
        "collectorRunId",
    )
    unique = all_passed and all(
        len({result[key] for result in results}) == 4
        for key in correlation_keys
    )
    total = sum(result.get("fetchedCount", 0) for result in results if isinstance(result, dict))
    if all_passed and not unique:
        status, reason, code = "failed", "correlation_identifier_reused", 65
    elif not all_passed:
        status, reason, code = "failed", "account_evidence_failed", 65
    elif total == 0:
        status, reason, code = "inconclusive_content", "all_accounts_zero_fetched", 75
    else:
        status, reason, code = "passed", "canary_passed", 0
    payload = {
        "schemaVersion": "x-production-account-canary.v1",
        "status": status,
        "reasonCode": reason,
        "requiredAccountCount": 4,
        "observedAccountCount": len(results),
        "collectionAttempted": any(
            result.get("collectionAttempted")
            for result in results
            if isinstance(result, dict)
        ),
        "expectedSha": config["expectedSha"],
        "imageId": config["imageId"],
        "fixedQueryId": "x-production-canary-fixed-v1",
        "accounts": results if not invalid else [],
        "totalFetchedCount": total if not invalid else 0,
        "warningCodes": sorted(
            {
                warning
                for result in results
                for warning in result.get("warningCodes", [])
            }
        ) if not invalid else [],
    }
    output(json.dumps(payload, sort_keys=True, separators=(",", ":")))
    raise SystemExit(code)

raise SystemExit(2)
'''


def fake_flock_script() -> str:
    return r'''#!/usr/bin/python3
import json
import sys
from pathlib import Path

root = Path(__file__).parent
config = json.loads((root / "config.json").read_text())
count_file = root / "flock-count"
count = int(count_file.read_text()) if count_file.exists() else 0
count += 1
count_file.write_text(str(count))
fd = sys.argv[-1]
with (root / "flock-log.jsonl").open("a") as stream:
    stream.write(json.dumps({"call": count, "fd": fd}) + "\n")
if count == int(config.get("flockMutateCall", 0)):
    Path(config["cookiesFile"]).write_text(json.dumps(config["mutatedPayload"]))
if count == int(config.get("flockMarkerMutateCall", 0)):
    Path(config["markerFile"]).write_text("c" * 40 + "\n")
if count == int(config.get("flockRuntimeMutateCall", 0)):
    config.update(config.get("runtimeMutation", {}))
    (root / "config.json").write_text(json.dumps(config))
if count == int(config.get("flockFailCall", 0)):
    raise SystemExit(1)
raise SystemExit(0)
'''
