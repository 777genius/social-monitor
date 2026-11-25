# Iteration 03 - Implementation Start Checklist

## Prerequisites

1. Normalized feed exists.
2. Feed items have source provenance.
3. Dedupe is stable.
4. Summary needs are known by product/mobile.

## Locked Before Work

1. User-visible summaries require citations.
2. AI provider is behind a port.
3. Structured output validation is mandatory.
4. Cost telemetry is mandatory.

## First Tickets

1. Define SummaryPolicy.
2. Define evidence model.
3. Define AiSummarizerPort.
4. Define output schema.

## No-Go Items

- Uncited final summaries.
- Provider calls directly in use cases.
- Prompt changes without eval path.
