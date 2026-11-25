# 145. Budget Guardrails Enforcement

## Status

Locked for FinOps baseline.

## Research Anchors

- FinOps Foundation introduction: https://www.finops.org/introduction/what-is-finops/
- FinOps terminology: https://framework.finops.org/assets/terminology/

## Decision

Budgets are runtime controls, not just dashboards. AI, source APIs, observability and storage need enforced guardrails.

## Guardrail Classes

| Spend Area | Guardrail |
|---|---|
| LLM summaries | daily tenant/model budget reservations |
| embeddings | batch budget and corpus-size limits |
| source API providers | source-specific quota and cost reservations |
| backfills | approval and cost estimate before enqueue |
| observability | sampling and high-cardinality rejection |
| storage | lifecycle retention and raw payload expiry |
| warehouse | query budget and scheduled job ownership |

## Enforcement

Before expensive work:

1. Estimate cost.
2. Check tenant budget.
3. Reserve budget.
4. Execute.
5. Commit actual usage.
6. Release unused reservation.
7. Emit usage event.

If budget is exhausted:

- skip optional enrichment;
- delay non-critical summaries;
- block backfills;
- notify tenant/admin if user-visible;
- never silently overspend.

## Reporting

Track unit economics:

- cost per scan;
- cost per normalized item;
- cost per summary;
- cost per digest delivered;
- cost per active tenant;
- provider cost by source kind.

## MVP Enforcement Evidence

Summary cost attribution is executable release evidence, not a spreadsheet task. `npm run check:summary-cost` recomputes `ops/cost/summary-cost-attribution.json` from deterministic summary eval fixtures and validates tenant, workspace, topic, source window, provider, model, prompt and schema dimensions before release.

## Best-Fact Choice

For this product, uncontrolled AI/source costs are a reliability risk. Budget enforcement must sit in the execution path, not only in monthly finance reports.
