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
EXPECTED_RELEASE_A_COUNT = 17
EXPECTED_RELEASE_B_COUNT = 98
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


def paths_under_roots(files: list[str], roots: tuple[str, ...]) -> list[str]:
    return sorted(
        file
        for file in files
        if any(file == root or file.startswith(f"{root}/") for root in roots)
    )


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
    if overlap:
        fail(f"Release A and Release B manifests overlap: {overlap}")
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
        fail("PostgreSQL pool releases must not own a daily timer")
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
        if arguments.backend_base != base or arguments.bootstrap_sha != ZERO_SHA:
            fail("first PostgreSQL adoption release has an unexpected durable base")
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
    adopted = set(changed_between(base, arguments.backend_base))
    missing = sorted(set(release_a + release_b) - adopted)
    if missing:
        fail(f"durable backend marker does not contain completed adoption: {missing}")


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
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    contract = load_contract()
    if arguments.command == "workspace":
        verify_workspace(contract)
    else:
        verify_ci(arguments, contract)


if __name__ == "__main__":
    main()
