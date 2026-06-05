# Iteration 03 - Traceability Matrix

| Goal | Phase | Ticket Area | Contract/Artifact | Tests/Checks | Done Evidence |
| --- | --- | --- | --- | --- | --- |
| Define summary policy | 01-summary-domain-contract | Domain | SummaryPolicy, rule value objects | Policy validation tests | Invalid rules rejected |
| Add AI adapter | 02-ai-provider-adapter | Provider port/adapter | AiSummarizerPort, output schema | Malformed output tests | Provider replaceable |
| Add quality controls | 03-evals-and-quality | Evals | Golden datasets, eval command | Eval run | Prompt changes checked |
| Expose summary UX | 04-summary-ux-readiness | API/UX contract | Summary REST, feedback API | REST acceptance | Latest cited summary available |
| Preserve evidence | 01-summary-domain-contract | Evidence model | Citation mapping | Citation coverage check | Claims trace to feed items |

## Unmapped Risk Check

- Hallucination maps to citation validation.
- Cost spike maps to token/cost telemetry.
- Prompt regression maps to eval harness.
- Provider lock-in maps to AI port.
