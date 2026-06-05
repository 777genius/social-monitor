# Iteration 01 - Traceability Matrix

| Goal | Phase | Ticket Area | Contract/Artifact | Tests/Checks | Done Evidence |
| --- | --- | --- | --- | --- | --- |
| Build monorepo | 01-monorepo-scaffold | Platform scaffold | NestJS apps/libs | Build, architecture tests | Monorepo builds |
| Boot local infra | 02-local-infrastructure | DevOps | Compose, health checks | Fresh checkout boot | Local dependencies healthy |
| Persist core state | 03-database-migrations | Data | Migrations, outbox, idempotency | Empty DB migration | Core schema exists |
| Expose baseline API | 04-api-worker-bootstrap | REST/API | Topic/source binding endpoints, OpenAPI | REST smoke, OpenAPI generation | Topic create works |
| Preserve boundaries | 01-monorepo-scaffold | Architecture tests | Import rules | Forbidden import test | Domain has no infra imports |

## Unmapped Risk Check

- Duplicate commands map to idempotency table and test.
- Lost events map to outbox.
- Mobile/backend drift maps to generated OpenAPI.
- Tenant leak maps to tenant context checks.
