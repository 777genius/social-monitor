# Iteration 00 - Change Control

## Change Types

| Change | Requires Review | Required Evidence |
| --- | --- | --- |
| New bounded context | Architecture owner | Context ownership and integration reason |
| New aggregate | Domain owner | Invariants and lifecycle |
| New source category | Source/platform owner | Risk class and production-safety assessment |
| Contract standard change | API/event owner | Compatibility impact |
| MVP scope change | Product and architecture owner | Impact on critical path |

## Approval Rules

1. Do not add a new context without removing ambiguity from existing contexts.
2. Do not add a source class without legal/reliability notes.
3. Do not change architecture guardrails without updating ticket quality rules.
4. Do not expand MVP scope unless it strengthens the end-to-end loop.
5. Create ADR only for decisions that affect future code shape, contracts, source policy or MVP scope.

## Rollback

- Revert scope changes by moving them to future roadmap.
- Revert source policy changes if they weaken production safety.
- Revert contract standards if they create unclear versioning.

## Audit Notes

Record every accepted change with reason, affected files and downstream iterations.

## Lightweight MVP Rule

If a decision does not affect architecture, source safety, contracts, tenancy or scope, record it as a simple change note instead of an ADR.
