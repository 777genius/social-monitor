# Iteration 01 - Retrospective Improvement Log

## Retrospective Goal
Capture whether the platform skeleton actually protects Clean Architecture and can support ingestion work.

## What Worked
- Monorepo structure made ownership visible.
- Generated OpenAPI reduced frontend/backend contract ambiguity.
- Outbox and idempotency were established before worker-heavy features.

## What To Improve
- Remove any shared packages without clear owner or boundary.
- Strengthen tests where controllers or adapters can leak business rules.
- Document local infra problems that slow onboarding.

## Architecture Lessons
- Domain purity must be enforced automatically, not by memory.
- Local platform choices need production mapping early.
- Contract generation is only useful if CI detects drift.

## Edge Cases Found
- Duplicate command creates duplicate side effects.
- Migration works on clean DB but fails on upgraded DB.
- Tenant context is optional in a path where it must be mandatory.

## Carryover To Next Iteration
- Ingestion must consume stable ports and persistence primitives.
- Any missing health or observability baseline goes to Iteration 02 readiness.
- Any flaky infra setup must be fixed before connector testing scales.
