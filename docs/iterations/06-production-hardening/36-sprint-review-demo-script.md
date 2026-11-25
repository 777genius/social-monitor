# Iteration 06 - Sprint Review Demo Script

## Review Goal
Prove that the MVP is safe enough for controlled beta: tenant isolation, secrets, observability, CI gates, quotas and recovery are covered.

## Demo Flow
1. Run tenant isolation negative tests.
2. Show secret encryption/redaction behavior.
3. Show dashboards for scans, summaries, costs and failures.
4. Trigger CI contract/migration/event gate examples.
5. Demonstrate quota exhaustion and user/operator states.
6. Show backup/restore verification.

## Evidence To Show
- Cross-tenant API/query/event access is blocked.
- Provider credentials never appear in logs or traces.
- Dashboards support common incident diagnosis.
- CI blocks breaking contract changes.
- Quotas cap runaway scans or summaries.

## Edge Cases To Exercise
- Worker attempts cross-tenant read.
- Provider error includes sensitive headers.
- Migration changes break compatibility.
- Cost spike from misconfigured topic.

## Review Questions
- Can beta launch with known residual risks?
- Are support/on-call owners able to diagnose without shell access?
- Are rollback and recovery paths practical?

## Accept Progress If
- Critical hardening gates are green.
- No known secret leakage path remains.
- Operational evidence is reviewable.
