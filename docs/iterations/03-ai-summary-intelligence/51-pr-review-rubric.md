# Iteration 03 - PR Review Rubric

## Review Goal
Ensure summary PRs keep AI output cited, validated, provider-neutral and cost-aware.

## Architecture Checks
- AI provider access goes through port.
- SummaryPolicy is not just prompt text.
- Citation validation is centralized.
- Provider schema does not leak into domain or public API.

## Test And Evidence Checks
- Structured output validation tests pass.
- Citation tests pass.
- Eval harness result is attached.
- Cost telemetry sample exists.

## Edge Case Checks
- Uncited claim.
- Missing citation target.
- Provider timeout/refusal.
- Contradictory evidence.

## Merge Blockers
- Final uncited summary is possible.
- Unvalidated provider output can persist.
- Cost cannot be attributed.
- Prompt/model change has no eval evidence.
