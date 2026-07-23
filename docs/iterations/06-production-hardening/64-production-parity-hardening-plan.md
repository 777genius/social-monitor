# Production Parity Hardening Plan

## Status

Approved for implementation on `feat/production-parity-hardening`.

## Goal

Close the verified production-readiness gaps without weakening the existing DDD,
Clean Architecture, tenant-scope or release gates:

1. remove database-versus-broker dual writes from scan requests;
2. activate fail-closed PostgreSQL RLS for tenant-owned data;
3. replace production in-memory metrics wiring with an exportable runtime;
4. remove the highest-risk cross-context dependencies;
5. make code-quality, architecture, migration and security gates green;
6. run the same blocking checks in review CI and align current-state docs.

## Research Gate

Every phase starts with:

1. current official documentation review;
2. exact definition and callsite discovery with `rg`;
3. type-aware/call-graph and semantic impact analysis where available;
4. a written decision in this plan, an ADR or the affected architecture memory;
5. focused tests before broad gates.

Initial research anchors:

- Prisma transactions and P2034 retry:
  https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- PostgreSQL row security:
  https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL `CREATE POLICY`:
  https://www.postgresql.org/docs/current/sql-createpolicy.html
- AWS transactional outbox:
  https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- OpenTelemetry JavaScript exporters:
  https://opentelemetry.io/docs/languages/js/exporters/

## Scope And Acceptance Evidence

### Phase 0 - Baseline

- Install locked dependencies without changing package versions.
- Record the base SHA and focused gate results.
- Inventory tenant-owned Prisma models, persistence entrypoints, metric
  composition roots and cross-context edges.

Evidence:

- clean worktree before edits;
- `check:architecture`, `check:code-quality`, `check:source-line-cap`,
  `check:migrations`, `check:tenant-db-guards`, `check:observability`.

Baseline at `ab225369ddea78e53a0a6a8ddd2ca6d270b6e89d`:

- pass: architecture, source line cap, migrations, tenant DB guardrails,
  observability definitions and runtime-profile guards;
- fail: code quality reports ten production files above 500 LOC and one Prisma
  write transaction without Serializable/P2034 protection;
- fail: persistence-readiness declarations are missing or stale for five
  in-memory adapters;
- dependency audit reports six moderate and one low advisory from the locked
  dependency graph; remediation requires a separate version/impact check.

### Phase 1 - Transactional Scan Dispatch

- Persist the scan job state and durable dispatch intent in one Serializable
  Prisma transaction with P2034 retry.
- Do not call RabbitMQ or another network dependency inside the transaction.
- Relay the durable command with retry, leasing/claim safety and idempotent
  consumer semantics.
- Keep deterministic in-memory implementations contract-equivalent.
- Cover rollback, relay failure, duplicate delivery, retry and crash recovery.

Evidence:

- focused monitoring persistence/use-case tests;
- relay/queue tests;
- `check:monitoring-persistence`, `check:event-store`,
  `check:event-relay`, `check:rabbitmq-queue-publisher`,
  `check:scan-queue-drain-loop`, `check:write-idempotency`.

Implemented evidence:

- manual and scheduled production composition use `ScanDispatchPort`;
- Prisma writer stores job, event and command intent in one Serializable
  transaction through `withPrismaWriteRetry`;
- command relay uses lease ownership, bounded backoff, redacted failures and a
  terminal attempt budget;
- focused Jest: 43 existing/new use-case and outbox tests passed;
- passed: TypeScript project compiler, architecture, source line cap,
  migrations, monitoring persistence, event store, event relay including the
  command exchange, RabbitMQ publisher, runtime-profile, scheduler,
  cross-process scheduler and write-idempotency checks;
- changed-file ESLint passed; full-repository lint hit its existing 1 GB heap
  ceiling and remains a final-gate item with an adjusted execution budget.

### Phase 2 - Production Metrics Runtime

- Keep `MetricsRecorderPort` as the inward-facing contract.
- Wire an exportable OpenTelemetry/Prometheus-compatible implementation in
  durable runtime profiles.
- Keep in-memory metrics for deterministic tests only.
- Enforce safe, bounded-cardinality labels and lifecycle shutdown.
- Add health/readiness and observability-contract evidence for the exporter.

Evidence:

- metrics adapter and composition tests;
- `check:observability`, `check:runtime-profile-guards`,
  `check:backend-ops-readiness`.

Implementation evidence:

- OpenTelemetry SDK/OTLP runtime is process-scoped across API, worker, relay,
  MCP and gRPC composition roots;
- beta mode rejects in-memory metrics and missing/unsafe OTLP endpoints;
- Collector `0.157.0` configuration validates with its real binary and exports
  a Prometheus-compatible surface;
- focused adapter, lifecycle, API readiness and multi-root composition tests
  pass.

### Phase 3 - Tenant RLS

- Generate explicit SQL policies for every table listed by the authoritative
  tenant DB guard contract.
- Use transaction-local tenant/workspace context; missing context must deny.
- Preserve explicit application tenant predicates and authorization.
- Separate migration-owner and application-runtime role assumptions and ensure
  the runtime role cannot bypass RLS.
- Cover cross-tenant read/write/delete, missing context, relay/worker access,
  migrations and required tenant indexes.
- Define an explicit, audited system-scope path for maintenance tables that
  cannot operate under one tenant.

Evidence:

- clean and seeded migration tests;
- Postgres integration tests under the non-owner runtime role;
- `check:tenant-db-guards`, `check:migrations`,
  `check:reader-surface-tenant-isolation`, persistence checks,
  security/dependency gates.

Implementation evidence:

- every protected table in the tenant DB contract has `ENABLE` and `FORCE ROW
  LEVEL SECURITY` with fail-closed tenant/workspace policies;
- Prisma operations run with transaction-local tenant context, while explicit
  worker polling uses a separately provisioned system login plus a NOLOGIN
  capability unavailable to the API login;
- an API login cannot obtain system access by spoofing `application_name` or
  the system GUC;
- PostgreSQL `18.4` integration gates pass for tenant isolation and for the
  protected reader-summary upgrade, replay, privilege and concurrency paths;
- focused TypeScript, ESLint and 23 Jest tests pass, including middleware,
  transaction scoping, background polling and raw-query cache coverage;
- tenant DB, migrations, architecture, line-cap, production-secret,
  external-evidence, reader-surface, persistence and security gates pass.

### Phase 4 - Dangerous Cross-Context Edges

- Inventory context edges and rank them by cycles, adapter leakage, write
  coupling and blast radius.
- Replace only the highest-risk edges with application-owned contracts,
  domain events or app-composition wiring.
- Add executable checks that prevent reintroduction.

Evidence:

- focused contract tests;
- `check:architecture`, `check:code-quality`,
  `check:source-line-cap`.

Implementation evidence:

- the Subscription activation feature now depends on its own
  `InterestSourceProvisionerPort`; Monitoring use cases and cadence policy are
  isolated in one anti-corruption adapter;
- Subscription domain and command types own their delivery and summary
  preference vocabulary instead of importing Summary and Delivery domain
  types;
- Identity authorizers and controllers depend on Identity-owned rate-limit and
  audit ports; concrete Usage workflows are isolated behind adapters;
- executable architecture rules prevent these direct feature, domain and
  interface dependencies from returning;
- TypeScript, 13 focused Jest tests, OpenAPI snapshot and full AppModule reader
  tenant e2e bootstrap pass.

### Phase 5 - Maintainability And Review CI

- Split every production file rejected by `check:code-quality` by
  responsibility without behavior changes.
- Fix every remaining Prisma write-transaction guard violation.
- Add review CI jobs for fast architecture/quality, contracts/security,
  backend tests and frontend gates with least-privilege permissions,
  concurrency cancellation and explicit timeouts.
- Update current-state architecture and operational docs; distinguish current
  behavior from future targets.

Evidence:

- all focused gates;
- workflow syntax/action policy checks;
- full allowed `verify` surface, excluding prohibited real-project agent or
  runtime smoke flows.

## Likely Owned Edit Set

- `libs/monitoring/features/request-scan/**`
- monitoring persistence, queue and composition code
- `libs/platform/events/**`, `apps/event-relay/**`
- `libs/platform/metrics/**` and production app composition roots
- `libs/platform/persistence/**`, `prisma/schema.prisma`,
  `prisma/migrations/**`
- `ops/security/tenant-db-guard-contract.json` and its verifier
- the bounded contexts identified by the coupling inventory
- the production files reported by `check:code-quality`
- `.github/workflows/**`
- current-state architecture/operations documentation

The exact edit set is narrowed by each phase impact analysis before editing.

## Non-Goals

- no product feature expansion;
- no frontend visual redesign;
- no removal of application-level authorization in favor of RLS;
- no network calls inside database transactions;
- no blanket rewrite of all cross-context imports;
- no copied workflow count target from another repository;
- no dependency-family replacement without a separate documented decision;
- no agent launch, provisioning, terminal-runtime, task-assignment or
  smoke-flow checks on this real project.

## Migration And Rollout Safety

- Prefer additive schema and role changes before enforcement.
- Make RLS rollout fail closed in beta/production and explicitly selectable in
  deterministic local tests.
- Every migration documents lock risk, rollout order and forward-fix strategy.
- No destructive reset or production migration execution is part of this PR.
- A rollback must be able to stop new writers without losing durable outbox
  commands or tenant context.

## Completion Audit

The PR is complete only when:

1. every phase acceptance item has direct evidence;
2. the production runtime has no in-memory metrics implementation wired;
3. scan dispatch has no database-versus-broker dual write;
4. tenant-owned tables are protected by tested fail-closed RLS under the
   actual runtime role;
5. blocking local gates are represented in review CI;
6. current-state docs match code;
7. the branch is pushed and a dedicated pull request contains the verification
   summary and residual operational risks.
