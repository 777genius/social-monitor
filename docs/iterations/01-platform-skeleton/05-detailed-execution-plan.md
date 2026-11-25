# Iteration 01 - Detailed Execution Plan

## Purpose

Build the platform skeleton so every later feature follows the same architectural path.

## Phase 01 - Monorepo Scaffold

### Steps

1. Create NestJS monorepo structure:
   - `apps/api-gateway`
   - `apps/ingestion-worker`
   - `apps/intelligence-worker`
   - `apps/delivery-service`
   - `libs/shared-kernel`
   - `libs/<bounded-context>/domain`
   - `libs/<bounded-context>/features`
   - `libs/<bounded-context>/ports`
   - `libs/<bounded-context>/adapters`
   - `libs/<bounded-context>/interfaces`
   - `libs/contracts`
2. Enable strict TypeScript.
3. Add ESLint import boundary rules.
4. Add path aliases by layer.
5. Add test runner for unit and integration tests.
6. Add shared primitives:
   - `Result`
   - `DomainError`
   - `Clock`
   - `IdGenerator`
   - `EventEnvelope`
7. Add dependency graph validation.
8. Add base CI commands.

### Feature Module Boundary Baseline

Each bounded context library follows this shape:

```text
libs/<context>/
  domain/
    entities/
    value-objects/
    events/
    policies/
  features/
    <use-case>/
      <use-case>.command.ts
      <use-case>.result.ts
      <use-case>.use-case.ts
      <use-case>.use-case.spec.ts
  ports/
    repositories/
    providers/
    messaging/
  adapters/
    persistence/
    messaging/
    providers/
    mappers/
  interfaces/
    rest/
    jobs/
    events/
```

Rules:

1. Domain entities do not use Nest decorators, ORM decorators or OpenAPI decorators.
2. Feature slices hold application/use-case behavior and import only domain, ports and shared kernel.
3. Context ports are interfaces/tokens required by feature slices.
4. Adapters implement ports and translate external payloads.
5. Interfaces map REST/jobs/events/WS to feature use cases.
6. App modules wire adapters to ports; use cases do not know which adapter is active.
7. Shared kernel stays limited to IDs, result/error primitives, clock, event envelope and common type guards.

### Edge Cases

- Circular dependency between contexts.
- Domain package imports Nest decorators.
- Shared kernel grows into a dumping ground.
- Generated contracts are committed inconsistently.
- Feature use case imports a concrete Postgres repository.
- Adapter mapper starts enforcing domain policy instead of translating.
- A generated DTO is passed directly into a domain constructor.

### Acceptance Gate

- Monorepo builds.
- Forbidden imports fail CI.
- Every app can boot with empty dependencies.
- First context library has domain/features/ports/adapters/interfaces separation proven by import-boundary tests.

## Phase 02 - Local Infrastructure

### Steps

1. Add Docker Compose for:
   - Postgres
   - Redis
   - Kafka
   - RabbitMQ
   - optional OpenTelemetry Collector
2. Add service health checks.
3. Add `.env.example`.
4. Add typed config validation.
5. Add local bootstrap script.
6. Add broker topic/queue creation script.
7. Add local reset script that does not destroy user files accidentally.

### Local Reliability Baseline

1. Dependency startup must use readiness checks, not fixed sleeps.
2. Workers must retry broker/database connection on boot with bounded logs.
3. Local reset must clearly separate generated volumes from source fixtures.
4. Broker setup must be idempotent so queue/topic creation can rerun safely.
5. `.env.example` must include every required variable with safe local defaults or clear placeholder.

### Edge Cases

- Kafka ready port opens before broker is actually usable.
- RabbitMQ queue has stale arguments from old run.
- Postgres volume keeps old migration state.
- Redis lock keys survive between local tests.
- Developer runs two local stacks with same ports.
- RabbitMQ queue argument changes require delete/recreate.
- Kafka topic retention is too short for local replay debugging.

### Acceptance Gate

- Fresh clone can start local infra.
- Health endpoint reports dependency status.
- Workers wait/retry dependencies correctly.
- Local fake-source vertical slice can run after a clean reset.

## Phase 03 - Database Migrations

### Steps

1. Select ORM/query strategy.
2. Define migration ownership by bounded context.
3. Create initial schemas:
   - tenants/users/memberships
   - topics/source bindings
   - scan jobs/cursors
   - source items
   - summary artifacts
   - delivery attempts
4. Add migration generation command.
5. Add migration apply command.
6. Add migration rollback/repair policy.
7. Add seed data for local beta scenario.
8. Add migration test in CI.
9. Add outbox, inbox and idempotency schema.
10. Add usage ledger baseline table if quotas will be enforced later.
11. Add schema version fields for cursor/raw metadata tables.

### First Schema Ownership

| Table Group | Owner Context | MVP Notes |
| --- | --- | --- |
| tenants, users, memberships | Identity/Tenancy | tenant/workspace scope and audit fields |
| topics, topic_rules | Monitoring | no provider cursor state |
| source_catalog, capability_profiles | Source Management | versioned source readiness/capability data |
| source_bindings, scan_policies | Source Management/Scheduling | capability snapshot and explicit cursor reset policy |
| scan_jobs, cursor_checkpoints | Scheduling/Ingestion | lease, retry, cursor schema version |
| source_items | Ingestion | normalized provenance, tenant/workspace/source scope |
| feed_items | Feed | dedupe key and topic/source linkage |
| summary_artifacts, summary_feedback | Summary | citations, schema/model/prompt version |
| delivery_attempts | Delivery | idempotency key and failure class |
| usage_records | Usage | append-only quota/cost evidence |
| outbox_events, inbox_records, idempotency_keys | Platform | shared operational tables with tenant scope where applicable |

Migration rules:

1. Tenant-owned unique indexes include tenant/workspace scope.
2. Cursor and raw metadata have schema version fields.
3. Outbox retention cannot delete events that still have failed inbox consumers.
4. Additive migrations are preferred during beta; destructive migrations require explicit backfill/rollback plan.
5. Seed data must not hide tenant-scope bugs.

### Edge Cases

- Migration adds NOT NULL before backfill.
- Worker writes while migration changes schema.
- Tenant id missing from unique indexes.
- Cursor payload schema changes without versioning.
- Outbox retention deletes events before failed consumer can recover.
- Seed data creates non-tenant-scoped records that tests accidentally rely on.
- Unique index accidentally dedupes the same provider item across two tenants.
- Cursor checkpoint is updated outside the item persistence transaction.
- Summary citation references source item deleted by retention policy.

### Acceptance Gate

- Migrations apply from empty DB.
- Migrations apply in CI.
- Tenant-scoped indexes exist for all tenant-owned tables.
- Upgrade-path migration test covers seeded tenant/topic/source-binding scenario.
- Outbox/idempotency schema is ready before ingestion workers.
- Tenant-scoped unique/index strategy is reviewed before first ingestion implementation.

## Phase 04 - API/Worker Bootstrap

### Steps

1. Create API gateway with:
   - validation pipe
   - auth placeholder
   - request id/correlation id
   - OpenAPI generation
2. Create worker bootstrap with:
   - graceful shutdown
   - broker subscriptions
   - retry policy
   - metrics hooks
3. Add health/readiness endpoints.
4. Add sample command/event flow.
5. Add structured logging.
6. Add trace propagation.
7. Add outbox dispatch loop skeleton.
8. Add inbox/event dedupe check.
9. Add idempotency check for baseline write command.

### First Vertical Slice Implementation Steps

1. Implement fake source capability profile.
2. Implement `CreateWorkspace`, `CreateTopic`, `BindSource`, `SetScanPolicy` use cases.
3. Implement `RequestScan` write path with idempotency key and outbox event.
4. Dispatch scan job to worker through queue adapter.
5. Worker claims job, re-checks topic/source state and quota preflight.
6. Fake source adapter returns deterministic source items.
7. Ingestion persists `SourceItem` and publishes item observed event through outbox.
8. Feed use case deduplicates into `FeedItem`.
9. Fake summary provider creates deterministic cited `SummaryArtifact`.
10. API exposes operation/feed/summary read endpoints.
11. Re-run same command/job/event and prove idempotent result.

### Edge Cases

- Worker receives event before migrations complete.
- Shutdown interrupts job after side effect but before checkpoint.
- API request id not propagated into async event.
- Generated OpenAPI changes nondeterministically.
- Duplicate event is delivered to the same consumer.
- Retry executes after tenant/source binding was disabled.
- Fake adapter hides source capability failures that real providers will expose.
- API response contains generated DTO shape that mobile domain later depends on directly.
- Outbox dispatcher publishes duplicate event after crash recovery.

### Acceptance Gate

- API and workers boot locally.
- Sample event roundtrip works.
- Graceful shutdown is tested.
- Duplicate command/event paths are proven idempotent in local tests.
- First fake-source vertical slice proves REST -> outbox -> queue/event -> worker -> read model.
