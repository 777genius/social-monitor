# Iteration 01 - Developer Execution Playbook

## Reading Order
1. Read `10-build-order-checklist.md`.
2. Read `35-first-sprint-ticket-cut.md`.
3. Read `38-architecture-compliance-audit.md`.
4. Read `39-contract-dependency-checklist.md`.
5. Read `41-test-fixtures-and-scenarios.md`.

## PR Slicing
- PR 1: monorepo scaffold and tooling.
- PR 2: local infrastructure and health checks.
- PR 3: persistence and migrations.
- PR 4: outbox and idempotency.
- PR 5: baseline REST/OpenAPI.

## Checks Before PR
- Import boundaries pass.
- Domain has no NestJS, ORM, broker or DTO dependency.
- Migrations run from clean and upgraded states.
- OpenAPI is generated, not manually edited.
- Duplicate-command test exists when idempotency is touched.

## Evidence To Attach
- Build/test command output.
- Migration validation from clean and upgraded database state.
- OpenAPI generation output or diff.
- Architecture import test result.
- Idempotency/outbox proof when touched.

## Architecture Guardrails
- Controllers translate, use cases decide.
- Adapters implement ports.
- Shared libs need narrow ownership.
- Events must be versioned, tenant-scoped and idempotency-aware.

## Escalate When
- A platform choice changes a public contract.
- A migration cannot be rolled forward safely.
- A shortcut would bypass outbox/idempotency.
