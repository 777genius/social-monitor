# Iteration 02 - Team Ownership And Communication

## Communication Goal
Keep connector implementation aligned with source policy, normalized feed contracts and downstream summary needs.

## Decision Owners
- Ingestion lead: provider port and adapters.
- Source policy owner: allowed acquisition paths.
- Feed schema owner: normalized item model.
- QA owner: connector certification.

## Reviewers
- Summary lead reviews evidence/provenance needs.
- Operations owner reviews scan failure visibility.
- Backend lead reviews scheduler and persistence behavior.

## Sync Points
- Kickoff: confirm HN/RSS/fake scope.
- Midpoint: review certification and cursor behavior.
- Closeout: confirm summary readiness.

## Escalate When
- Provider fields are requested downstream.
- Cursor crash/retry behavior is unclear.
- A new source request appears.
- Adapter cannot pass certification.

## Handoff Message
Ingestion is ready when summaries can consume normalized feed items with stable IDs, provenance and provider-neutral failure state.
