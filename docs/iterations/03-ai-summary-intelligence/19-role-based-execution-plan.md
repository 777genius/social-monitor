# Iteration 03 - Role-Based Execution Plan

## Summary Domain Owner

- Define SummaryPolicy.
- Define evidence/citation model.
- Define summary lifecycle.

## AI Engineer

- Implement AiSummarizerPort.
- Implement provider adapter.
- Maintain prompt templates.
- Track token/cost telemetry.

## QA/Eval Owner

- Build golden datasets.
- Run evals on prompt/model changes.
- Validate citation coverage.

## API Owner

- Expose summary status/latest/history endpoints.
- Expose feedback endpoint.
- Maintain OpenAPI compatibility.

## Mobile/Product

- Review summary contract.
- Define feedback vocabulary.
- Validate user-visible states.

## Handoffs

- Summary REST contract -> mobile.
- Summary events -> realtime.
- Cost telemetry -> ops.
- Feedback taxonomy -> beta launch.
