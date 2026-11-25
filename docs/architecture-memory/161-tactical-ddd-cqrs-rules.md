# 161. Tactical DDD and CQRS Rules

## Status

Locked for implementation blueprint.

## Research Anchors

- NestJS CQRS recipe: https://docs.nestjs.com/recipes/cqrs
- DDD Reference by Eric Evans/Domain Language: https://www.domainlanguage.com/ddd/reference/

## Decision

Use tactical DDD consistently, but apply CQRS pragmatically. Commands and queries are separated at application boundaries; separate physical read/write stores are introduced only when justified.

## Aggregate Rules

Aggregates:

- enforce business invariants;
- expose behavior methods, not public mutable state;
- emit domain events internally;
- are loaded/saved through repositories;
- should stay small and transactionally meaningful.

Initial aggregate candidates:

- `Tenant`;
- `Membership`;
- `Topic`;
- `SourceBinding`;
- `ScanPolicy`;
- `ScanRun`;
- `ContentCluster`;
- `SummaryArtifact`;
- `Digest`;
- `NotificationChannel`.

## Command Rules

Commands:

- express user/system intent;
- run authorization and entitlement checks;
- load aggregates through ports;
- persist changes in one transaction where possible;
- write outbox events in the same transaction;
- return application result, not ORM entity.

## Query Rules

Queries:

- read optimized read models;
- do not mutate state;
- enforce tenant authorization;
- can use projections/search indexes;
- return DTOs shaped for API/client needs.

## Best-Fact Choice

CQRS is useful as a boundary discipline even before separate databases. Do not over-engineer event sourcing unless audit/replay requirements truly demand it.

