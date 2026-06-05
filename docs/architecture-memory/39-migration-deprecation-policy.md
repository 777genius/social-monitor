# Migration & Deprecation Policy

Date: 2026-05-31
Status: baseline migration/deprecation memory

## Decision

Every public/internal contract must have a deprecation policy.

Applies to:

- REST endpoints;
- Kafka events;
- gRPC methods;
- Flutter generated clients;
- connector contracts;
- summary schemas;
- provider adapters;
- database read models.

## Deprecation Flow

```text
1. mark deprecated
2. add replacement
3. emit usage metrics
4. notify consumers
5. dual-run or dual-publish where needed
6. verify zero/acceptable usage
7. remove after migration window
```

## Migration Windows

Internal/MVP:

```text
1-2 weeks can be acceptable if all consumers are controlled
```

Production SaaS:

```text
public REST: 90 days
event contracts: 60-90 days
mobile client breaking changes: support at least previous app version
connector output schema: dual-write until downstream migrated
```

## Database Migrations

Large table migrations require:

- migration plan;
- rollback plan;
- online/backfill-safe approach;
- observability;
- staged deployment if code/data coupling exists.

Use expand/contract pattern where needed:

```text
add new column/table
dual write
backfill
switch reads
stop old writes
remove old column/table later
```

## Schema Versioning

Use semantic versioning for packages/contracts that declare a public API. SemVer requires a declared public API.

References:

- Semantic Versioning: https://semver.org/
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/

## Locked Decisions

1. No silent breaking changes.
2. Breaking changes require migration notes and rollback.
3. Large DB migrations need staged rollout.
4. Mobile client compatibility is explicitly considered.
5. Public contract packages use semantic versioning when a public API exists.

