# Iteration 03 - First Sprint Ticket Cut

## Sprint Objective
Build a cited summary pipeline with configurable policy, AI-provider abstraction, validation, evaluation and cost telemetry.

## Ticket 1 - SummaryPolicy Domain Model
- Define user-configurable summary rules, format, cadence, language, citation strictness and budget hints.
- Acceptance: policy can be validated without calling an AI provider.
- Edge cases: conflicting user rules, unsupported formats and excessive input size.

## Ticket 2 - Evidence And Citation Model
- Model evidence windows, source item references and citation requirements.
- Acceptance: final summaries can trace claims back to feed item IDs.
- Edge cases: deleted items, duplicate evidence and contradictory source claims.

## Ticket 3 - AiSummarizerPort
- Define provider-neutral request/response schema.
- Include usage, model, failure and retry metadata.
- Acceptance: provider can be swapped without changing use cases.
- Edge cases: partial outputs, provider refusal, timeout and structured-output failure.

## Ticket 4 - Structured Output Validation
- Add schema validation and rejection path for malformed summaries.
- Acceptance: invalid provider output is not persisted as final summary.
- Edge cases: valid JSON with unsupported content, missing citations or hallucinated references.

## Ticket 5 - Eval Harness
- Add small golden dataset and scoring checks for citation, relevance and brevity.
- Acceptance: prompt/model changes run through repeatable evals.
- Edge cases: eval must catch uncited claims, not just syntax failures.

## No-Go Criteria
- Uncited summaries are shown as final.
- AI provider details leak into domain.
- Cost telemetry is missing.
