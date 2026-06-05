# Iteration 03 - Master Implementation Sequence

## PR Slice Rule
- One PR should change one summary slice: policy, evidence, provider port, validation, evals or API/status.
- Each PR must preserve citations, schema validation and cost attribution.
- Split if prompt tuning is bundled with domain policy or public API changes.

## Step 1 - Open Control Docs
- Read summary policy phase, first sprint ticket cut and evidence register.
- Confirm AI, evidence, backend, eval and cost owners.
- Check citation, validation and telemetry blockers.

## Step 2 - Cut Tickets
- Create SummaryPolicy ticket.
- Create evidence/citation model ticket.
- Create AiSummarizerPort ticket.
- Create structured output validation ticket.
- Create eval harness ticket.
- Create summary API/status ticket.

## Step 3 - Execute In Order
- Model policy before prompts.
- Model evidence before final summary persistence.
- Define provider port before SDK integration.
- Add validation before storing provider output.
- Add eval before prompt/model iteration.

## Step 4 - Validate
- Run policy, citation, structured output and eval tests.
- Verify cost telemetry.
- Confirm mobile can display trust and failure states.

## Step 5 - Close
- Fill final go/no-go.
- Handoff summary, citation and failure contracts to mobile.
- Promote only when final summaries are cited and validated.
