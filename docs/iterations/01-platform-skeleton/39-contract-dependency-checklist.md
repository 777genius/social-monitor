# Iteration 01 - Contract Dependency Checklist

## Purpose
Protect the platform skeleton from contract drift before ingestion and mobile work depend on it.

## Input Dependencies
- Iteration 00 contract standards.
- Tenant and idempotency rules.
- Source policy guardrails.
- Bounded context map.

## Output Contracts
- Generated OpenAPI baseline.
- Database migration conventions.
- Outbox event envelope.
- Idempotency key contract.
- Health and readiness endpoints.
- Inbox/consumer dedupe contract.
- Schema ownership and migration safety contract.
- Usage ledger baseline contract if quota enforcement starts later.

## Owners
- API owner owns OpenAPI generation and compatibility.
- Platform owner owns migration and local infra contracts.
- Backend lead owns event envelope and idempotency.
- Mobile representative validates client-generation usability.

## Breaking-Change Risks
- Manual OpenAPI edits diverge from controllers.
- Migration schema changes without upgrade path.
- Event envelope changes after workers depend on it.
- Idempotency semantics change after ingestion starts.
- Outbox retention or dispatch semantics change after consumers depend on replay.
- Idempotency key scope changes from global to tenant/workspace or vice versa.
- Cursor schema changes without versioning.

## Transition Readiness
- Iteration 02 can build connector workers using stable outbox/idempotency.
- Mobile can generate clients from baseline OpenAPI.
- CI can detect contract drift.
- Workers can depend on outbox/inbox retry and dedupe behavior.
- Ingestion can store cursor/raw metadata with versioned schema.
