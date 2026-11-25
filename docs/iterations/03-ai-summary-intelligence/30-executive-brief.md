# Iteration 03 - Executive Brief

## Goal

Create cited, auditable, cost-tracked summaries behind an AI provider port with eval coverage.

## Main Risk

User-visible summaries become untrusted because they are uncited, malformed, expensive or not evaluated.

## Required Outputs

- SummaryPolicy.
- Evidence/citation model.
- AI provider port.
- Structured output validation.
- Eval harness.
- Cost/token telemetry.
- Summary and feedback APIs.

## Stop Gate

Do not expose summaries in mobile until citations, schema validation and failure states are complete.

## Next Transition

Move to `04-mobile-app` when latest cited summaries are available through REST.
