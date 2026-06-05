# Iteration 01 - Architecture Decision Record Seeds

## Purpose
List platform decisions that must be captured before ingestion depends on them.

## ADR Seeds
- Choose NestJS monorepo module structure.
- Choose ORM and migration approach.
- Establish outbox pattern for reliable event publication.
- Establish idempotency key strategy.
- Define Kafka vs RabbitMQ usage boundaries.
- Define criteria for physical microservice extraction.
- Define when gRPC is allowed and what evidence is required.

## Alternatives To Capture
- Modular monolith first vs independently deployed microservices immediately.
- Kafka-only messaging vs Kafka plus RabbitMQ worker queues.
- ORM-managed entities vs explicit domain models with mappers.
- REST/events only vs adding gRPC for internal synchronous calls.
- One shared database vs context-owned schemas/tables with explicit migration ownership.

## Consequences To Record
- Modular monorepo reduces early deployment cost while preserving extraction boundaries.
- Outbox adds persistence complexity but prevents lost events.
- Strict domain boundaries require mappers and tests.
- Physical extraction adds deployment, observability, contract testing and rollback cost.
- Multiple transports require clear responsibility boundaries to avoid duplicated workflows.

## Revisit Triggers
- Service boundary requires independent scaling.
- Migration workflow becomes a bottleneck.
- Message broker responsibilities blur across teams.
- Internal REST/event path proves too slow or too coupled for a specific use case.
- A worker or service needs independent deploy cadence during beta operations.
