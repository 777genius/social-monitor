# Iteration 03 - Backlog Prioritization Matrix

## Prioritization Goal
Prioritize trustworthy cited summaries before personalization or provider variety.

## P0 - Do First
- SummaryPolicy.
- Evidence and citation model.
- AiSummarizerPort.
- Structured output validation.
- Citation validation.

## P1 - Do After P0
- Eval harness.
- Cost telemetry.
- Summary status API/events.
- Failure states.
- Golden dataset.

## P2 - Defer If Needed
- Multiple AI providers.
- Advanced personalization.
- Many summary formats.
- Large eval corpus.

## Prioritize Higher When
- Work affects final summary trust.
- Work affects mobile citation display.
- Work affects provider portability.
- Work affects cost attribution.

## Do Not Prioritize
- Fluent output before citation safety.
- Provider-specific features before provider port.
- Prompt tuning before eval harness.
