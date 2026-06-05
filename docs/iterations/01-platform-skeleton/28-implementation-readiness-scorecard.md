# Iteration 01 - Implementation Readiness Scorecard

| Area | Ready When | Status |
| --- | --- | --- |
| Architecture | Monorepo boundaries and import rules are known | To review |
| Data | Core schema, outbox and idempotency plan are ready | To review |
| Infrastructure | Local DB/brokers and health strategy are ready | To review |
| API | OpenAPI generation path is chosen | To review |
| Testing | Build, migration and architecture checks are planned | To review |
| Handoff | Mobile/ingestion know expected contracts | To review |

## Go/No-Go Rule

Start implementation only if outbox/idempotency, tenant context and OpenAPI generation are not deferred.

## Status Legend

- `Green` - documented, reviewed and backed by evidence.
- `Yellow` - owner, mitigation and deadline are written.
- `Red` - dependent work is blocked.
- `To review` - default state; not approval.

## Evidence Required

Attach the evidence in `59-traceable-evidence-register.md` before marking any row `Green`.
