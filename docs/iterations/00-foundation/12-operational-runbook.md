# Iteration 00 - Operational Runbook

## Daily Workflow

1. Review the product loop before accepting new decisions.
2. Map every decision to bounded context, aggregate or contract.
3. Record source acquisition decisions with risk class.
4. Keep a running list of assumptions that affect implementation.
5. Close the day by checking whether any ticket lacks context/layer/tests.

## Review Cadence

- Architecture review after context map.
- Source policy review before connector planning.
- Frontend/backend alignment review before monorepo scaffold.
- Final readiness review before production code starts.

## Blockers

- Unclear source legality or reliability.
- Missing aggregate owner.
- Conflicting context boundaries.
- Contract versioning disagreement.
- MVP scope not tied to the end-to-end loop.

## Handoff Notes

- Hand off the context map to backend and Flutter leads.
- Hand off source acquisition policy to ingestion lead.
- Hand off contract rules to API/event owners.
- Hand off ticket quality rule to project management.

## Support And Ops Impact

- Support vocabulary starts here: topic, source binding, scan, feed item, summary, citation.
- Ops must understand source risk classes before beta.
- Future incidents should map to the domain terms defined in this iteration.
