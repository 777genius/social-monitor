# Iteration 01 - Decision Log

## Decision 001 - Modular Monorepo Before Physical Split

- Decision: Start with NestJS monorepo apps/libs and clean boundaries before independent service deployment.
- Alternatives: Split every bounded context into physical microservice immediately.
- Rationale: Contracts need to stabilize before adding deployment overhead.
- Consequences: Faster local development, with service boundaries still explicit.
- Revisit When: A bounded context has stable contracts and independent scaling/deployment need.

## Decision 002 - Outbox And Idempotency From Start

- Decision: Add outbox and idempotency foundation before ingestion.
- Alternatives: Add later after duplicate/lost event issues appear.
- Rationale: Event-driven workflows depend on safe retries and transactional publishing.
- Consequences: More early schema work, lower reliability risk.
- Revisit When: Eventing strategy changes materially.
