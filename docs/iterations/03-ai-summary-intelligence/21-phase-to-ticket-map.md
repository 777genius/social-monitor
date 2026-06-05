# Iteration 03 - Phase To Ticket Map

| Phase | Ticket Groups | Key Artifacts | Closure Evidence |
| --- | --- | --- | --- |
| 01-summary-domain-contract | Summary policy, evidence, lifecycle | Domain model | Invalid rules rejected |
| 02-ai-provider-adapter | AI port, provider adapter, schema validation | Adapter + output schema | Provider is replaceable |
| 03-evals-and-quality | Golden data, eval harness, cost checks | Eval suite | Prompt changes are checked |
| 04-summary-ux-readiness | REST endpoints, feedback, summary state | Summary API | Cited summary visible |

## Ticket Cutting Rule

Each summary ticket must state citation behavior, output schema impact and cost/test evidence.

## Traceability Rule

Before a ticket is ready, map it to `08-ticket-breakdown.md`, `11-acceptance-test-plan.md`, `14-traceability-matrix.md` and `59-traceable-evidence-register.md`. If the ticket cannot produce evidence, split or rewrite it.
