# Iteration 01 - Production Readiness Gap Analysis

## Readiness Goal
Ensure the platform skeleton can support reliable MVP delivery and future service extraction.

## MVP-Ready Areas
- NestJS monorepo builds.
- Domain/application/adapter boundaries are enforceable.
- Local infrastructure is repeatable.
- Migrations are present.
- Outbox and idempotency exist.
- OpenAPI is generated.

## Acceptable MVP Gaps
- Full Kubernetes deployment can be deferred.
- Full production observability can be completed in hardening.
- gRPC service extraction can wait until internal call patterns prove need.

## Blocking Gaps
- Domain depends on framework or infrastructure.
- Migrations are unreliable.
- Outbox/idempotency is missing.
- API contracts cannot be generated.

## Owner Actions
- Backend lead fixes boundary violations.
- Platform owner fixes infra and migration gaps.
- Contract owner fixes OpenAPI drift.
- QA owner adds duplicate and migration regression tests.

## Follow-Up
Carry infra scale gaps into Iteration 06, but do not carry architecture-boundary gaps into Iteration 02.
