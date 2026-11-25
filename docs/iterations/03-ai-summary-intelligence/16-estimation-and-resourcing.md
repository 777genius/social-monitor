# Iteration 03 - Estimation And Resourcing

## Relative Effort

- Complexity: High
- Risk: High because poor summaries damage product trust
- Recommended duration: 1-2 sprints

## Required Roles

- AI/backend engineer
- Domain owner for summary policy
- Feed owner for evidence mapping
- QA/eval owner
- Ops owner for cost telemetry

## Parallel Work

1. Summary policy and evidence model first.
2. AI adapter and eval harness can run in parallel after output schema draft.
3. Mobile summary UI can start with mocked contract after REST shape stabilizes.

## Bottlenecks

- Evidence model blocks citations.
- Output schema blocks mobile.
- Cost telemetry blocks beta readiness.

## No-Cut Areas

- Citation validation.
- Structured output validation.
- Eval harness.
- Cost/token tracking.
- Provider abstraction.
