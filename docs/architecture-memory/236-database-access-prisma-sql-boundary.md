# 236 - Database Access Prisma/SQL Boundary

## Decision

Use Prisma ORM as the default TypeScript data access layer for transactional CRUD and type-safe queries.

Use explicit SQL for database-native features, performance-critical queries and migrations that Prisma cannot model cleanly.

## Sources

- Prisma with NestJS: https://www.prisma.io/docs/guides/nestjs
- Prisma transactions: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- Prisma raw queries: https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries
- Prisma Migrate: https://www.prisma.io/docs/orm/prisma-migrate
- PostgreSQL documentation: https://www.postgresql.org/docs/current/

## Why This Boundary

Prisma gives:

- generated TypeScript client
- schema-driven model visibility
- type-safe common queries
- strong NestJS developer ergonomics
- migration workflow

Postgres still owns:

- RLS policies
- partial indexes
- GIN/tsvector indexes
- pgvector indexes
- generated columns
- concurrent index creation
- complex reporting SQL
- lock-specific maintenance

## Repository Policy

Application code depends on repository ports.

Repository adapters may use Prisma Client internally, but port interfaces must not expose Prisma types.

Forbidden in domain/application:

- `PrismaClient`
- Prisma model payload types
- raw SQL strings
- transaction client implementation details

## Transaction Policy

Use Prisma `$transaction` for use-case transaction boundaries.

Interactive transactions are allowed when multiple dependent operations need one atomic boundary, but Prisma warns long transactions harm DB performance and can cause deadlocks. Therefore:

- no network calls inside transactions
- no LLM calls inside transactions
- no provider API calls inside transactions
- no long-running batch loops inside transactions

## Raw SQL Policy

Raw SQL is allowed for:

- full-text search ranking
- pgvector queries
- RLS setup
- index operations
- partition maintenance
- optimized read models
- migration backfills

Raw SQL must be:

- parameterized
- owned by an adapter
- covered by integration tests
- reviewed for tenant predicates
- explainable with expected indexes

## Migration Policy

Prisma Migrate can generate baseline migrations, but custom SQL is expected for advanced Postgres features.

Every migration must declare:

- lock risk
- rollback/forward-fix path
- data backfill needs
- estimated runtime class
- environment rollout order

Do not auto-apply destructive migrations in production.

## Unit Of Work

Use a `UnitOfWorkPort` in application layer.

Implementation may wrap Prisma transaction client, but the port exposes only:

```text
runInTransaction(work)
```

Repositories receive transaction context through adapter-level mechanisms, not domain objects.

## Testing

Required:

- repository integration tests against Postgres
- migration tests on empty and seeded DB
- raw SQL tenant isolation tests
- transaction rollback tests
- connection pool exhaustion smoke tests

## Architecture Rule

Prisma improves developer velocity. It does not replace database design.

When database correctness/performance needs native SQL, use native SQL deliberately and keep it behind ports.
