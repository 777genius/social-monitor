# Iteration 01 - Open Questions And Assumptions

## Working Assumptions

1. Services start as modular monorepo apps.
2. PostgreSQL is the primary database.
3. Kafka is the durable event backbone.
4. RabbitMQ is optional for job dispatch if it simplifies worker semantics.

## Open Questions

| Question | Owner | Deadline | Decision Impact |
| --- | --- | --- | --- |
| Which ORM/migration tool is final? | Backend/data owner | Before schema work | Migration implementation |
| Is RabbitMQ included in MVP runtime or local-only first? | Platform/SRE | Before scheduler | Worker design |
| Which auth provider is MVP baseline? | Backend/security | Before mobile auth | API gateway |
| Which OpenAPI generator will Flutter use? | Mobile/API owner | Before mobile shell | Client generation |

## Validation Rule

Do not build ingestion until outbox, idempotency and tenant-scoped REST baseline are settled.
