# Iteration 07 - Traceable Evidence Register

## Evidence Goal
Prove that beta validated the MVP loop and produced actionable post-MVP decisions.

## Critical Audit Evidence
- Launch evidence bundle covers E2E, source certification, summary eval, security and restore.
- Known limitations are visible to users and support.
- Beta ring expansion decisions are go/hold/rework with evidence.
- Post-MVP backlog separates blockers, accepted gaps, evidence-based opportunities and deferred ideas.
- Capacity envelope, degradation behavior and ring expansion thresholds are visible in launch evidence.

## Decision Evidence
- Beta scope freeze.
- Supported source list.
- Launch/rollback gates.
- Feedback taxonomy.
- Post-MVP source expansion criteria.

## Ticket Evidence
- Onboarding tickets link to walkthrough results.
- Launch tickets link to checklist status.
- Feedback tickets link to classified examples.
- Roadmap tickets link to demand/risk/cost evidence.

## Review Evidence
- Cross-functional beta review is complete.
- Support owner confirms known limitations.
- Architecture owner reviews post-MVP backlog safety.

## Handoff Evidence
- Post-MVP owners accept prioritized backlog.
- ADR and quality-gate updates are linked.

## Executable Evidence Added
- `npm run check:mvp-core-loop` proves the backend MVP loop without network or paid provider access:
  topic creation -> source binding -> scan policy -> scan request queue -> ingestion execution -> feed projection -> summary request/execution -> `summary.ready` event -> realtime projection/replay.
- The gate uses real use cases and ports across monitoring, ingestion, feed, summary and delivery. Only external source/model dependencies are deterministic adapters.
- The gate is now a blocking release evidence item in `ops/release/mvp-release-evidence-contract.json` and is included in `npm run verify`.

## Missing Evidence Blocks
- Feedback has no owner/category/evidence.
- Unsupported source request bypasses policy.
- Ring expansion lacks capacity/cost/source-health evidence.
