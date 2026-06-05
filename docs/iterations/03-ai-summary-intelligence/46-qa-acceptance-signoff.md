# Iteration 03 - QA Acceptance Signoff

## Signoff Goal
Confirm that summaries are cited, validated, evaluated and cost-aware.

## Acceptance Scenarios
- SummaryPolicy validates supported rules.
- Summary output cites feed item IDs.
- Invalid structured output is rejected.
- Eval harness runs on golden dataset.
- Usage and cost telemetry are recorded.

## Negative Cases
- Uncited claim.
- Missing citation target.
- Malformed provider output.
- Provider timeout/refusal.
- Token budget exceeded.

## Regression Coverage
- Citation validation cases.
- Structured output schema cases.
- Eval dataset.
- Cost telemetry snapshot.

## Residual Risks
- Larger eval datasets can grow after beta.
- Multiple model providers can be phased later.

## Approvers
- AI lead.
- Backend lead.
- Product owner.
- Operations owner.
