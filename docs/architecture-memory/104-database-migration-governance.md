# 104. Database Migration Governance

## Status

Locked for architecture baseline.

## Research Anchors

- Prisma Migrate development and production: https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
- Prisma Migrate CLI: https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate
- PostgreSQL documentation: https://www.postgresql.org/docs/current/index.html

## Decision

Use Prisma for application-level schema management where it fits, but keep SQL migrations reviewable and production-safe. Postgres is the source of truth.

## Migration Workflow

Development:

- generate migration from schema changes;
- review SQL before merge;
- run tests against migrated database;
- use disposable local databases for branch switching where possible.

Production:

- only apply committed migrations;
- run migration in release pipeline as a controlled step;
- block deploy on migration failure;
- record migration status in release notes;
- never use destructive reset commands.

## Zero-Downtime Rules

Safe sequence:

1. Add nullable column/table/index.
2. Deploy code that writes both old and new when needed.
3. Backfill in bounded batches.
4. Switch reads.
5. Stop old writes.
6. Drop old column/table in later release.

Forbidden in hot paths without explicit plan:

- long table locks;
- large unbounded backfills;
- changing column type in place on large tables;
- dropping fields used by previous mobile clients;
- adding non-null columns without defaults/backfill strategy.

## Data Ownership

Each bounded context owns its tables. Shared reporting reads from projections/warehouse, not direct cross-context writes.

## Best-Fact Choice

Prisma is useful for TypeScript productivity, but production database safety depends on reviewed SQL, expand/contract migrations, backups and release discipline.

