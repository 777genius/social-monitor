# Iteration 01 - Role-Based Execution Plan

## Backend Platform

- Scaffold NestJS monorepo.
- Create apps/libs.
- Add architecture tests.
- Implement baseline REST flow.

## Data Owner

- Create core migrations.
- Add outbox and idempotency tables.
- Validate clean database migration.

## DevOps/SRE

- Build local compose.
- Add health checks.
- Prepare observability baseline.

## Mobile Owner

- Validate OpenAPI shape.
- Prepare generated client setup.
- Flag missing error states early.

## QA

- Verify topic create smoke.
- Verify duplicate command behavior.
- Verify architecture tests fail on forbidden imports.

## Handoffs

- OpenAPI -> mobile.
- Outbox/event envelope -> ingestion.
- Local infra docs -> all developers.
