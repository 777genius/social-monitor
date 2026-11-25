# Iteration 01 - Phase To Ticket Map

| Phase | Ticket Groups | Key Artifacts | Closure Evidence |
| --- | --- | --- | --- |
| 01-monorepo-scaffold | NestJS apps, libs, architecture tests | Monorepo, import rules | Apps/libs build |
| 02-local-infrastructure | Compose, DB, Kafka, RabbitMQ, health | Local infra | Fresh checkout boots |
| 03-database-migrations | Core schema, outbox, idempotency | Migrations | Clean DB migration passes |
| 04-api-worker-bootstrap | REST baseline, OpenAPI, health | Topic/source APIs | Tenant-scoped topic create works |

## Ticket Cutting Rule

Each ticket must state whether it changes code structure, schema, OpenAPI or event foundation.

## Traceability Rule

Before a ticket is ready, map it to `08-ticket-breakdown.md`, `11-acceptance-test-plan.md`, `14-traceability-matrix.md` and `59-traceable-evidence-register.md`. If the ticket cannot produce evidence, split or rewrite it.
