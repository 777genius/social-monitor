#!/usr/bin/env python3
"""Enforce the exact two-release adoption split for the first pool rollout."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "ops/deploy/postgres-pool-release-contract.json"
ZERO_SHA = "0" * 40
EXPECTED_RELEASE_A_COUNT = 18
EXPECTED_RELEASE_B_COUNT = 98
EXPECTED_ATOMIC_REPAIR_COUNT = 17
EXPECTED_DAILY_TIMER_CONTRACT = {
    "dailyTimerOwner": "daily-readiness-v6b",
    "dailyTimerHistoricalOwner": "daily-readiness-v6b",
    "dailyTimerReadyOwner": "daily-delivery-c1-runtime-control",
    "dailyTimerPath": "ops/deploy/production-runtime/social-monitor-daily.timer",
    "dailyTimerSchedule": "*-*-* 00:15:00 UTC",
    "dailyTimerRule": "The historical pool adoption releases do not change timer ownership. A later runtime-control release transfers ownership transactionally to the repo-owned legacy timer only for an exact READY C1 marker; BLOCKED retains the existing reviewed owner and READY cannot regress to BLOCKED.",
    "dailyTimerInvariant": "Normal topology has exactly one reviewed production daily timer enabled and active. READY normal topology requires social-monitor-daily.timer enabled and active with the v6 timer disabled and inactive. A valid persistent REQUESTED or CONTAINED marker requires both timers disabled and inactive and both services inactive; an invalid marker fails closed.",
}
# Release A owns the historical EOF normalization; Release B owns the later
# substantive pool-budget documentation at the same non-runtime path.
EXPECTED_RELEASE_OVERLAP = (
    "docs/architecture-memory/173-postgres-connection-pooling.md",
)
# These roots intentionally mirror BACKEND_PATHS and CONTROL_PATHS in the
# production deploy entrypoint; the one-time split must obey that classifier.
BACKEND_PATH_ROOTS = (
    ".dockerignore",
    "Dockerfile",
    "apps/agent-runtime",
    "apps/api-gateway",
    "apps/delivery-service",
    "apps/event-relay",
    "apps/ingestion-worker",
    "apps/intelligence-worker",
    "apps/social-research-grpc",
    "apps/social-research-mcp",
    "apps/social-research-runtime",
    "apps/x-collector",
    "docker-compose.yml",
    "libs",
    "ops/evals",
    "package-lock.json",
    "package.json",
    "prisma",
    "prisma.config.ts",
    "scripts",
    "test",
    "tsconfig.build.json",
    "tsconfig.json",
    "vendor",
)
CONTROL_PATH_ROOTS = (
    ".github/workflows/production-deploy.yml",
    "ops/deploy",
    "ops/recovery/backup-restore-contract.json",
)


def fail(message: str) -> None:
    raise SystemExit(message)


def load_contract() -> dict[str, Any]:
    try:
        contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read PostgreSQL release contract: {error}")
    if not isinstance(contract, dict) or contract.get("schemaVersion") != 1:
        fail("PostgreSQL release contract schema is invalid")
    for key in (
        "adoptionBaseCommit",
        "adoptionBackendCommit",
        "atomicRepairBaseCommit",
    ):
        value = contract.get(key)
        if (
            not isinstance(value, str)
            or len(value) != 40
            or any(character not in "0123456789abcdef" for character in value)
        ):
            fail(f"PostgreSQL release contract {key} is invalid")
    if contract.get("atomicRepairPathCount") != EXPECTED_ATOMIC_REPAIR_COUNT:
        fail(
            "PostgreSQL atomic repair contract must remain pinned to exactly "
            f"{EXPECTED_ATOMIC_REPAIR_COUNT} paths"
        )
    atomic_paths = contract.get("atomicRepairPaths")
    if (
        not isinstance(atomic_paths, list)
        or not all(isinstance(path, str) for path in atomic_paths)
        or atomic_paths != sorted(set(atomic_paths))
        or len(atomic_paths) != EXPECTED_ATOMIC_REPAIR_COUNT
    ):
        fail("PostgreSQL atomic repair paths must be the exact sorted admitted set")
    for path in atomic_paths:
        candidate = pathlib.PurePosixPath(path)
        if candidate.is_absolute() or ".." in candidate.parts:
            fail(f"PostgreSQL atomic repair contains unsafe path: {path}")
    for key, expected in EXPECTED_DAILY_TIMER_CONTRACT.items():
        if contract.get(key) != expected:
            fail(f"PostgreSQL daily timer contract {key} is invalid")
    return contract


def manifest(path: str) -> list[str]:
    manifest_path = ROOT / path
    try:
        files = [
            line.strip()
            for line in manifest_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
    except OSError as error:
        fail(f"cannot read release manifest {path}: {error}")
    if files != sorted(set(files)):
        fail(f"release manifest must be sorted with unique paths: {path}")
    for file in files:
        candidate = pathlib.PurePosixPath(file)
        if candidate.is_absolute() or ".." in candidate.parts:
            fail(f"release manifest contains unsafe path: {file}")
    return files


def git_lines(*arguments: str) -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(ROOT), *arguments],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        fail(result.stderr.strip() or f"git {' '.join(arguments)} failed")
    return [line for line in result.stdout.splitlines() if line]


def changed_between(base: str, target: str) -> list[str]:
    return sorted(git_lines("diff", "--name-only", base, target, "--"))


def assert_ancestor(ancestor: str, target: str, failure_message: str) -> None:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "merge-base", "--is-ancestor", ancestor, target],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return
    if result.returncode == 1:
        fail(failure_message)
    fail(result.stderr.strip() or "git merge-base --is-ancestor failed")


def workspace_changes(base: str) -> list[str]:
    tracked = git_lines("diff", "--name-only", base, "--")
    untracked = git_lines("ls-files", "--others", "--exclude-standard")
    return sorted(set(tracked + untracked))


def assert_exact(actual: list[str], expected: list[str], release: str) -> None:
    if actual == expected:
        return
    missing = sorted(set(expected) - set(actual))
    unexpected = sorted(set(actual) - set(expected))
    fail(
        f"{release} file set violates the executable adoption contract; "
        f"missing={missing}, unexpected={unexpected}"
    )


def assert_regular_blobs(target: str, expected: list[str]) -> None:
    actual: dict[str, tuple[str, str]] = {}
    for entry in git_lines("ls-tree", target, "--", *expected):
        try:
            metadata, path = entry.split("\t", 1)
            mode, object_type, _object_id = metadata.split()
        except ValueError:
            fail("PostgreSQL atomic repair target tree is malformed")
        if path in actual:
            fail(f"PostgreSQL atomic repair target repeats path: {path}")
        actual[path] = (mode, object_type)
    if sorted(actual) != expected:
        fail("PostgreSQL atomic repair target is missing an admitted path")
    for path, (mode, object_type) in actual.items():
        if mode not in ("100644", "100755") or object_type != "blob":
            fail(f"PostgreSQL atomic repair target is not a regular blob: {path}")


def paths_under_roots(files: list[str], roots: tuple[str, ...]) -> list[str]:
    return sorted(
        file
        for file in files
        if any(file == root or file.startswith(f"{root}/") for root in roots)
    )


def assert_completed_adoption(
    base: str,
    backend_base: str,
    release_a: list[str],
    release_b: list[str],
) -> None:
    assert_ancestor(
        base,
        backend_base,
        "PostgreSQL adoption base is not an ancestor of durable backend marker",
    )
    adopted = set(changed_between(base, backend_base))
    missing = sorted(set(release_a + release_b) - adopted)
    if missing:
        fail(f"durable backend marker does not contain completed adoption: {missing}")


def manifests(contract: dict[str, Any]) -> tuple[list[str], list[str]]:
    release_a = manifest(str(contract["releaseAManifest"]))
    release_b = manifest(str(contract["releaseBManifest"]))
    if (
        contract.get("releaseAFileCount") != EXPECTED_RELEASE_A_COUNT
        or len(release_a) != EXPECTED_RELEASE_A_COUNT
    ):
        fail(
            "Release A manifest must remain pinned to exactly "
            f"{EXPECTED_RELEASE_A_COUNT} paths"
        )
    if (
        contract.get("releaseBFileCount") != EXPECTED_RELEASE_B_COUNT
        or len(release_b) != EXPECTED_RELEASE_B_COUNT
    ):
        fail(
            "Release B manifest must remain pinned to exactly "
            f"{EXPECTED_RELEASE_B_COUNT} paths"
        )
    overlap = sorted(set(release_a) & set(release_b))
    if overlap != list(EXPECTED_RELEASE_OVERLAP):
        fail(
            "Release A and Release B manifest overlap must remain pinned to "
            f"exactly {list(EXPECTED_RELEASE_OVERLAP)}; actual={overlap}"
        )
    backend_in_release_a = paths_under_roots(release_a, BACKEND_PATH_ROOTS)
    if backend_in_release_a:
        fail(f"Release A contains backend paths: {backend_in_release_a}")
    control_in_release_b = paths_under_roots(release_b, CONTROL_PATH_ROOTS)
    if control_in_release_b:
        fail(f"Release B contains control paths: {control_in_release_b}")
    for required in (
        ".github/workflows/production-deploy.yml",
        "ops/deploy/social-monitor-production-deploy.sh",
        "ops/deploy/postgres-runtime-deploy-lib.sh",
        "ops/deploy/verify-postgres-pool-release-contract.py",
    ):
        if required not in release_a:
            fail(f"Release A is missing bootstrap-critical path: {required}")
    if not any(path.startswith("libs/platform/persistence/") for path in release_b):
        fail("Release B does not contain the bounded persistence implementation")
    if any(path.endswith(".timer") for path in release_a + release_b):
        fail("historical PostgreSQL pool adoption releases must not own a timer")
    return release_a, release_b


def verify_workspace(contract: dict[str, Any]) -> None:
    release_a, release_b = manifests(contract)
    base = str(contract["adoptionBaseCommit"])
    assert_exact(workspace_changes(base), release_a, "Release A workspace")
    print(
        "postgres-pool-release-contract "
        f"release_a_files={len(release_a)} release_b_files={len(release_b)}"
    )


def verify_ci(arguments: argparse.Namespace, contract: dict[str, Any]) -> None:
    release_a, release_b = manifests(contract)
    base = str(contract["adoptionBaseCommit"])
    if arguments.bootstrap == "uninstalled":
        if arguments.backend != "false" or arguments.control != "true":
            fail("first PostgreSQL adoption release must be control-only")
        if arguments.bootstrap_sha != ZERO_SHA:
            fail("uninstalled PostgreSQL bootstrap has a nonzero durable release SHA")
        if arguments.backend_base != base:
            fail(
                "uninstalled PostgreSQL bootstrap is allowed only for ordinary Release A"
            )
        assert_exact(changed_between(base, arguments.target), release_a, "Release A")
        return
    if arguments.bootstrap != contract["bootstrapVersion"]:
        fail("PostgreSQL adoption has an unsupported bootstrap state")
    if arguments.bootstrap_sha == ZERO_SHA:
        fail("installed PostgreSQL bootstrap has no durable release SHA")
    if arguments.backend_base == base:
        if arguments.backend != "true":
            fail("Release B must be the next backend release after bootstrap")
        if arguments.control != "false":
            fail("Release B must not mutate bootstrap/control paths")
        assert_exact(
            changed_between(arguments.bootstrap_sha, arguments.target),
            release_b,
            "Release B",
        )
        return

    # After Release B, later deployments are outside this one-time split. The
    # durable backend marker must still contain every A+B path; later releases
    # may add paths, but cannot masquerade as a completed adoption without the
    # bootstrap and bounded-runtime surfaces.
    assert_completed_adoption(base, arguments.backend_base, release_a, release_b)


def verify_atomic_repair(
    arguments: argparse.Namespace, contract: dict[str, Any]
) -> None:
    adoption_backend = str(contract["adoptionBackendCommit"])
    if arguments.backend_base != adoption_backend:
        fail("durable backend marker is not the exact adoption backend")
    target = arguments.target
    repair_base = str(contract["atomicRepairBaseCommit"])
    assert_ancestor(
        repair_base,
        target,
        "atomic PostgreSQL bootstrap target does not descend from the repair base",
    )
    expected = list(contract["atomicRepairPaths"])
    assert_exact(
        changed_between(repair_base, target),
        expected,
        "Atomic PostgreSQL repair",
    )
    assert_regular_blobs(target, expected)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("workspace")
    ci = subparsers.add_parser("ci")
    ci.add_argument("--target", required=True)
    ci.add_argument("--backend-base", required=True)
    ci.add_argument("--backend", choices=("true", "false"), required=True)
    ci.add_argument("--control", choices=("true", "false"), required=True)
    ci.add_argument(
        "--bootstrap", choices=("uninstalled", "postgres-pool-v1"), required=True
    )
    ci.add_argument("--bootstrap-sha", required=True)
    atomic_repair = subparsers.add_parser("atomic-repair")
    atomic_repair.add_argument("--target", required=True)
    atomic_repair.add_argument("--backend-base", required=True)
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    contract = load_contract()
    if arguments.command == "workspace":
        verify_workspace(contract)
    elif arguments.command == "ci":
        verify_ci(arguments, contract)
    else:
        verify_atomic_repair(arguments, contract)


if __name__ == "__main__":
    main()
