# Iteration 01 - Iteration Acceptance Contract

## Provider
Platform team provides backend scaffold, local infra, persistence, contracts and reliability primitives.

## Receiver
Iteration 02 ingestion team receives platform foundations for connector work.

## Handoff Promises
- Monorepo builds and boundaries are enforceable.
- Local infra starts repeatably.
- Migrations run from clean and upgraded states.
- OpenAPI generation works.
- Outbox and idempotency protect write/event paths.

## Receiver Expectations
- Ingestion can add workers through application ports.
- Connector APIs can rely on generated contracts.
- Duplicate scans or commands can be made idempotent.

## Blocking Defects
- Domain boundary violation.
- Missing outbox/idempotency proof.
- Unreliable migration path.
- Manual OpenAPI drift.

## Allowed Exceptions
- Production deployment depth can move to hardening.
- gRPC extraction can wait for proven need.
