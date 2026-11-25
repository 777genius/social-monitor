# Iteration 01 - Final Go/No-Go Checklist

## Decision Scope
Decide whether platform skeleton is ready for ingestion implementation.

## Go Conditions
- Monorepo build, lint and tests pass.
- Domain boundaries are enforced.
- Local infra starts repeatably.
- Migrations run clean and upgraded paths.
- OpenAPI generation works.
- Outbox and idempotency are proven.

## Hold Conditions
- Production deployment depth is incomplete but not needed for ingestion.
- Advanced observability remains scheduled for hardening.

## Rework Conditions
- Domain imports framework or infrastructure.
- Migration path is unreliable.
- OpenAPI is manually patched.
- Duplicate commands create duplicate effects.

## Accepted Exceptions
- gRPC extraction can wait.
- Autoscaling and full deployment topology can wait.

## Critical Audit Evidence
- Tenant context, OpenAPI generation, outbox/inbox and idempotency evidence is attached.
- Architecture boundary tests block forbidden imports.
- Clean and upgraded migration paths are proven.
- Data lifecycle fields and retention owners are defined for MVP tables.
- Contract compatibility gate is proven for OpenAPI, generated client, event/job schema and deploy-safe migrations.

## Decision Record
Record decision as `go`, `hold` or `rework` with build, migration, contract and idempotency evidence.
