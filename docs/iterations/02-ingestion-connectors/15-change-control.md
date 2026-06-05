# Iteration 02 - Change Control

## Change Types

| Change | Requires Review | Required Evidence |
| --- | --- | --- |
| Provider SDK change | Ingestion owner | Certification test update |
| New adapter | Source/platform owner | Capability profile and risk class |
| Normalized item schema change | Feed/summary owners | Dedupe and citation impact |
| Scheduler behavior change | Worker/ops owners | Idempotency and retry impact |
| Cursor strategy change | Ingestion owner | Data-loss analysis |

## Approval Rules

1. Do not add adapters that fail source safety policy.
2. Do not change normalized item schema without summary/mobile impact review.
3. Do not change retry behavior without dead-letter visibility.
4. Do not change cursor rules without replay/idempotency tests.
5. Record future-source requests as readiness decisions, not implementation commitments.

## Rollback

- Disable risky provider through source catalog.
- Pause source binding if provider behavior changes.
- Roll back schema changes only with feed/summary compatibility plan.

## Audit Notes

Record provider capability changes, failure taxonomy changes and dedupe rule changes.

## Lightweight MVP Rule

Connector ADRs are required for new source categories, acquisition modes, cursor semantics or normalized schema changes; fixture additions and parser bug fixes can be change notes.
