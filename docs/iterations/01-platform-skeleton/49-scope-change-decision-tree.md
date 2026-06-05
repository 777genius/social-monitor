# Iteration 01 - Scope Change Decision Tree

## Decision Goal
Prevent platform changes from creating hidden coupling or premature infrastructure scope.

## Accept Now If
- Change strengthens import boundaries.
- Change improves migration repeatability.
- Change makes OpenAPI/outbox/idempotency clearer.

## Defer If
- Change adds production deployment depth not needed for ingestion start.
- Change adds gRPC extraction before service boundaries prove need.
- Change adds observability that belongs in hardening.

## Escalate To ADR If
- Change alters module/service boundaries.
- Change changes ORM, migration or broker strategy.
- Change changes public API or event envelope rules.

## Block If
- Change makes domain depend on NestJS, ORM, broker or DTOs.
- Change bypasses outbox/idempotency.
- Change creates unowned shared libraries.

## Required Record
- Contract impact.
- Migration impact.
- Boundary impact.
- Test evidence required.
