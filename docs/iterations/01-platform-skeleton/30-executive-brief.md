# Iteration 01 - Executive Brief

## Goal

Create the NestJS monorepo skeleton, local infrastructure, core schema, OpenAPI baseline and architecture checks.

## Main Risk

Building ingestion on top of unstable contracts, missing tenant context, missing outbox or missing idempotency.

## Required Outputs

- NestJS apps/libs.
- Local PostgreSQL/Kafka/RabbitMQ foundation.
- Core migrations.
- Outbox and idempotency.
- Baseline REST/OpenAPI.
- Architecture tests.

## Stop Gate

Do not start real ingestion until tenant-scoped topic creation, OpenAPI generation, outbox and idempotency work.

## Next Transition

Move to `02-ingestion-connectors` when local platform boots and baseline REST flow is stable.
