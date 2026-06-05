# Iteration 01 - Operational Runbook

## Daily Workflow

1. Start local infrastructure and verify health checks.
2. Run monorepo build and architecture tests.
3. Apply migrations from clean database when schema changes.
4. Regenerate OpenAPI after API changes.
5. Record contract changes and migration risks.
6. End the day with topic creation smoke test.

## Review Cadence

- Monorepo boundary review after scaffold.
- Migration review before schema merge.
- API contract review before mobile integration.
- Infra readiness review before ingestion begins.

## Blockers

- Database or broker cannot boot reliably.
- Domain imports infrastructure.
- Tenant context is absent from command/query flow.
- OpenAPI generation is unstable.
- Outbox/idempotency foundation is missing.

## Handoff Notes

- Hand off OpenAPI to Flutter lane.
- Hand off event envelope to ingestion and summary lanes.
- Hand off local infra docs to all developers.
- Hand off architecture test failures to code owners immediately.

## Support And Ops Impact

- Health checks become the first support diagnostic.
- Migration logs must be readable before beta.
- Idempotency and outbox decisions affect every future incident investigation.
