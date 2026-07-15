# 173. Postgres Connection Pooling

## Status

Locked for database scalability baseline.

## Research Anchors

- PostgreSQL connection settings: https://www.postgresql.org/docs/current/runtime-config-connection.html
- PgBouncer features: https://www.pgbouncer.org/features.html
- PgBouncer documentation: https://www.pgbouncer.org/usage.html

## Decision

Use application-side pools initially, but design for PgBouncer before production load. Connection count is a shared database budget.

## Rules

- Every service has explicit pool min/max.
- Worker concurrency must fit DB connection budget.
- Do not raise Postgres `max_connections` casually.
- API, workers, migrations and admin tools have separate connection budgets.
- Long transactions are monitored and discouraged.
- Background jobs must release connections while waiting on external providers.

## PgBouncer

Use PgBouncer when:

- many pods/workers create too many idle connections;
- scaling API/worker replicas threatens database connection limits;
- managed Postgres offers built-in pooling.

Transaction pooling is preferred for high concurrency, but verify ORM/Prisma/prepared statement compatibility before enabling. Session pooling is safer for compatibility but less efficient.

## Observability

Track:

- active/idle connections;
- pool wait time;
- transaction duration;
- blocked queries;
- connection errors;
- per-service connection usage.

## Best-Fact Choice

Postgres scales poorly with uncontrolled connection fanout. Treat connections like CPU/memory: budgeted, monitored and enforced.
