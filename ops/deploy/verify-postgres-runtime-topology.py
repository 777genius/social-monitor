#!/usr/bin/env python3
"""Verify rendered production pools against live PostgreSQL capacity facts."""

from __future__ import annotations

import json
import math
import pathlib
import sys
from typing import Any


EXPECTED_DATABASE_PROCESSES = {
    "api": ("api-gateway", 2, "persistent"),
    "ingestion-worker": ("ingestion-worker", 2, "persistent"),
    "intelligence-worker": ("intelligence-worker", 2, "persistent"),
    "delivery-service": ("delivery-service", 1, "persistent"),
    "event-relay": ("event-relay", 1, "persistent"),
    "daily-runner": ("daily-runner", 2, "daily"),
}

# Repository-owned consumers. These are policy facts, never operator claims.
DAILY_AUXILIARY_CONNECTIONS = 1
MIGRATION_CONNECTIONS = 1
BACKUP_CONNECTIONS = 1
CAPACITY_VERIFICATION_CONNECTIONS = 1
MANUAL_CONNECTIONS = 3
OPTIONAL_RUNTIME_CONNECTIONS = 2
MINIMUM_PROVIDER_RESERVE = 5
MINIMUM_PROVIDER_RESERVE_RATIO = 0.20
PRODUCTION_PERSISTENT_BUDGET = 8
PRODUCTION_MAXIMUM_ENVELOPE = 16
REPOSITORY_CONNECTION_CEILING = 17
FORBIDDEN_OPERATOR_CAPACITY_CLAIMS = {
    "POSTGRES_BACKUP_CONNECTIONS",
    "POSTGRES_CAPACITY_VERIFICATION_CONNECTIONS",
    "POSTGRES_DAILY_AUXILIARY_CONNECTIONS",
    "POSTGRES_MANUAL_CONNECTIONS",
    "POSTGRES_MIGRATION_CONNECTIONS",
    "POSTGRES_OPTIONAL_RUNTIME_CONNECTIONS",
    "POSTGRES_PROVIDER_EFFECTIVE_CAPACITY",
    "POSTGRES_PROVIDER_HEADROOM",
    "POSTGRES_PROVIDER_MAX_CONNECTIONS",
    "POSTGRES_PROVIDER_RESERVED_CONNECTIONS",
    "POSTGRES_PROVIDER_REQUIRED_RESERVE",
    "POSTGRES_REPLACEMENT_OVERLAP_CONNECTIONS",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def load_object(path: str, description: str) -> dict[str, Any]:
    try:
        value = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read {description}: {error}")
    if not isinstance(value, dict):
        fail(f"{description} must be a JSON object")
    return value


def exact_integer(value: Any, name: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        fail(f"{name} must be an integer >= {minimum}")
    return value


def rendered_integer(value: Any, name: str, minimum: int) -> int:
    if isinstance(value, bool):
        fail(f"{name} must be an explicit base-10 integer")
    rendered = str(value)
    if not rendered.isascii() or not rendered.isdecimal():
        fail(f"{name} must be an explicit base-10 integer")
    parsed = int(rendered)
    if str(parsed) != rendered or parsed < minimum:
        fail(f"{name} must be an explicit base-10 integer >= {minimum}")
    return parsed


def environment_for(services: dict[str, Any], service_name: str) -> dict[str, Any]:
    service = services.get(service_name)
    if not isinstance(service, dict):
        fail(f"rendered Compose service is missing: {service_name}")
    environment = service.get("environment")
    if not isinstance(environment, dict):
        fail(f"rendered Compose environment is missing for {service_name}")
    return environment


def replicas_for(services: dict[str, Any], service_name: str) -> int:
    service = services[service_name]
    deploy = service.get("deploy") or {}
    if not isinstance(deploy, dict):
        fail(f"rendered Compose deploy topology is malformed for {service_name}")
    candidates: list[int] = []
    if "replicas" in deploy:
        candidates.append(
            rendered_integer(deploy["replicas"], f"{service_name} replicas", 1)
        )
    if "scale" in service:
        candidates.append(
            rendered_integer(service["scale"], f"{service_name} scale", 1)
        )
    if not candidates:
        fail(f"rendered Compose replicas/scale must be explicit for {service_name}")
    if len(set(candidates)) != 1:
        fail(f"rendered Compose replicas/scale disagree for {service_name}")
    return candidates[0]


def live_capacity(facts: dict[str, Any]) -> tuple[int, int, int, int]:
    server_maximum = exact_integer(
        facts.get("serverMaxConnections"), "live max_connections", 1
    )
    superuser_reserved = exact_integer(
        facts.get("superuserReservedConnections"),
        "live superuser_reserved_connections",
    )
    reserved = exact_integer(
        facts.get("reservedConnections"), "live reserved_connections"
    )
    server_reserved = superuser_reserved + reserved
    server_application_capacity = server_maximum - server_reserved
    if server_application_capacity < 1:
        fail("live PostgreSQL reserved connections consume server capacity")

    effective_limits = [server_application_capacity]
    for fact_name, display_name in (
        ("roleConnectionLimit", "live role connection limit"),
        ("databaseConnectionLimit", "live database connection limit"),
    ):
        limit = exact_integer(facts.get(fact_name), display_name, -1)
        if limit >= 0:
            effective_limits.append(limit)
    effective_capacity = min(effective_limits)
    if effective_capacity < 1:
        fail("live PostgreSQL role/database capacity is zero")
    external_occupancy = exact_integer(
        facts.get("externalConnectionOccupancy"),
        "live external connection occupancy",
    )
    stopped_runtime_occupancy = exact_integer(
        facts.get("stoppedRuntimeConnectionOccupancy"),
        "live stopped-runtime connection occupancy",
    )
    if stopped_runtime_occupancy != 0:
        fail("old PostgreSQL runtime sessions remain after container removal")
    if facts.get("capturePhase") != "post-old-container-stop-pre-new-start":
        fail(
            "live PostgreSQL occupancy must be captured after old containers "
            "stop and before replacements start"
        )
    if external_occupancy >= effective_capacity:
        fail("live PostgreSQL external occupancy consumes effective capacity")
    return server_maximum, server_reserved, effective_capacity, external_occupancy


def reject_operator_capacity_claims(path: str) -> None:
    try:
        lines = pathlib.Path(path).read_text(encoding="utf-8").splitlines()
    except OSError as error:
        fail(f"cannot read production environment for capacity-claim review: {error}")
    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name = line.split("=", 1)[0].removeprefix("export ").strip()
        if name in FORBIDDEN_OPERATOR_CAPACITY_CLAIMS:
            fail(
                "operator-only PostgreSQL capacity claim is forbidden in the "
                f"production environment at line {line_number}: {name}"
            )


def verify_daily_topology(service_path: str, runner_path: str) -> None:
    try:
        service = pathlib.Path(service_path).read_text(encoding="utf-8")
        runner = pathlib.Path(runner_path).read_text(encoding="utf-8")
    except OSError as error:
        fail(f"cannot read effective daily topology: {error}")
    expected_runner = str(pathlib.Path(runner_path))
    exec_start_lines = [
        line.strip() for line in service.splitlines() if line.startswith("ExecStart=")
    ]
    if not any(expected_runner in line for line in exec_start_lines):
        fail("effective daily service does not execute the reviewed runner")
    for compose_path in (
        "integration/docker-compose.yml",
        "control/compose.production.yml",
        "control/compose.managed-db.yml",
        "control/postgres-runtime-current/compose.postgres-runtime.yml",
        "integration/ops/deploy/production-runtime/compose.agent-runtime-model.yml",
    ):
        if compose_path not in runner:
            fail(f"effective daily runner omits Compose input: {compose_path}")
    if "control/daily-run-singleton.lock" not in runner:
        fail("effective daily runner does not take its separate singleton lock")
    if (
        "control/daily-run.lock" not in runner
        or "FLOCK_COMMAND=flock" not in runner
        or '"$FLOCK_COMMAND" -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8'
        not in runner
    ):
        fail("effective daily runner does not wait on PostgreSQL admission")
    if "POSTGRES_ADMISSION_WAIT_SECONDS=7500" not in runner:
        fail("effective daily runner does not use the reviewed admission timeout")
    if "TimeoutStartSec=23400" not in service:
        fail("effective daily service does not use the reviewed start timeout")
    if "Restart=no" not in service:
        fail("effective daily service must not restart a completed or failed run")
    if (
        "postgres-runtime-current/READY" not in runner
        or "deploy-state/backend.sha" not in runner
    ):
        fail("effective daily runner lacks the atomic backend-release marker guard")


def verify(rendered: dict[str, Any], facts: dict[str, Any]) -> None:
    services = rendered.get("services")
    if not isinstance(services, dict):
        fail("rendered Compose services are missing")

    for service_name, service in services.items():
        environment = service.get("environment") or {}
        if not isinstance(environment, dict):
            fail(f"rendered Compose environment is malformed for {service_name}")
        stale_claims = sorted(FORBIDDEN_OPERATOR_CAPACITY_CLAIMS & environment.keys())
        if stale_claims:
            fail(
                "operator-only PostgreSQL capacity claims are forbidden in rendered "
                f"Compose: {service_name} has {stale_claims}"
            )

    persistent_connections = 0
    daily_connections = 0
    rendered_processes: dict[str, str] = {}
    for service_name, (process_id, approved_maximum, lifecycle) in (
        EXPECTED_DATABASE_PROCESSES.items()
    ):
        environment = environment_for(services, service_name)
        if environment.get("POSTGRES_RUNTIME_PROCESS") != process_id:
            fail(f"POSTGRES_RUNTIME_PROCESS mismatch for {service_name}")
        pool_minimum = rendered_integer(
            environment.get("POSTGRES_RUNTIME_POOL_MIN"),
            f"{service_name} POSTGRES_RUNTIME_POOL_MIN",
            0,
        )
        if pool_minimum != 0:
            fail(f"POSTGRES_RUNTIME_POOL_MIN must be exactly 0 for {service_name}")
        pool_maximum = rendered_integer(
            environment.get("POSTGRES_RUNTIME_POOL_MAX"),
            f"{service_name} POSTGRES_RUNTIME_POOL_MAX",
            1,
        )
        if pool_maximum != approved_maximum:
            fail(
                f"POSTGRES_RUNTIME_POOL_MAX must be exactly {approved_maximum} "
                f"for {service_name}"
            )
        process_connections = pool_maximum * replicas_for(services, service_name)
        rendered_processes[process_id] = service_name
        if lifecycle == "daily":
            daily_connections = process_connections
        else:
            persistent_connections += process_connections

    for service_name, service in services.items():
        process_id = (service.get("environment") or {}).get(
            "POSTGRES_RUNTIME_PROCESS"
        )
        if process_id is not None and rendered_processes.get(process_id) != service_name:
            fail(f"unexpected PostgreSQL process identity on {service_name}")

    (
        server_maximum,
        server_reserved,
        effective_capacity,
        external_occupancy,
    ) = live_capacity(facts)
    if persistent_connections != PRODUCTION_PERSISTENT_BUDGET:
        fail(
            "rendered PostgreSQL persistent budget drifted: "
            f"{persistent_connections} != {PRODUCTION_PERSISTENT_BUDGET}"
        )
    uncoordinated = MANUAL_CONNECTIONS + OPTIONAL_RUNTIME_CONNECTIONS
    envelopes = {
        "steady-and-manual": persistent_connections + uncoordinated,
        "daily-and-manual": (
            persistent_connections
            + daily_connections
            + DAILY_AUXILIARY_CONNECTIONS
            + uncoordinated
        ),
        "migration-and-manual": (
            persistent_connections + MIGRATION_CONNECTIONS + uncoordinated
        ),
        "backup-and-manual": (
            persistent_connections + BACKUP_CONNECTIONS + uncoordinated
        ),
        "capacity-verification-and-manual": (
            persistent_connections
            + CAPACITY_VERIFICATION_CONNECTIONS
            + uncoordinated
        ),
        # Replacement overlap is structurally zero after old containers are removed.
        "replacement-and-manual": persistent_connections + uncoordinated,
    }
    maximum_application_connections = max(envelopes.values())
    if maximum_application_connections != PRODUCTION_MAXIMUM_ENVELOPE:
        fail(
            "rendered PostgreSQL maximum envelope drifted: "
            f"{maximum_application_connections} != {PRODUCTION_MAXIMUM_ENVELOPE}"
        )
    if maximum_application_connections > REPOSITORY_CONNECTION_CEILING:
        fail(
            "rendered PostgreSQL maximum envelope exceeds repository ceiling: "
            f"{maximum_application_connections} > {REPOSITORY_CONNECTION_CEILING}"
        )
    available_capacity = effective_capacity - external_occupancy
    provider_headroom = available_capacity - maximum_application_connections
    required_reserve = max(
        MINIMUM_PROVIDER_RESERVE,
        math.ceil(effective_capacity * MINIMUM_PROVIDER_RESERVE_RATIO),
    )
    if provider_headroom < required_reserve:
        fail(
            "live PostgreSQL capacity leaves insufficient provider headroom: "
            f"headroom={provider_headroom}, required={required_reserve}, "
            f"effective_capacity={effective_capacity}, "
            f"external_occupancy={external_occupancy}, envelopes={envelopes}"
        )
    print(
        "postgres-budget-live "
        f"server_max_connections={server_maximum} "
        f"server_reserved_connections={server_reserved} "
        f"effective_capacity={effective_capacity} "
        f"external_occupancy={external_occupancy} "
        f"available_capacity={available_capacity} "
        f"persistent={persistent_connections} "
        f"maximum={maximum_application_connections} "
        f"repository_ceiling={REPOSITORY_CONNECTION_CEILING} "
        "replacement_overlap=0 "
        f"required_reserve={required_reserve} "
        f"provider_headroom={provider_headroom}"
    )


def main() -> None:
    if len(sys.argv) == 4 and sys.argv[1] == "daily":
        verify_daily_topology(sys.argv[2], sys.argv[3])
        return
    if len(sys.argv) not in (3, 4):
        fail(
            "usage: verify-postgres-runtime-topology.py "
            "RENDERED_JSON LIVE_FACTS_JSON [OPERATOR_ENV] | "
            "daily EFFECTIVE_SERVICE EFFECTIVE_RUNNER"
        )
    if len(sys.argv) == 4:
        reject_operator_capacity_claims(sys.argv[3])
    verify(
        load_object(sys.argv[1], "rendered Compose configuration"),
        load_object(sys.argv[2], "live PostgreSQL capacity facts"),
    )


if __name__ == "__main__":
    main()
