# Iteration 03 - Iteration Acceptance Contract

## Provider
Summary team provides cited, validated, provider-neutral summary contracts and telemetry.

## Receiver
Iteration 04 mobile team receives summary, citation and failure-state contracts.

## Handoff Promises
- SummaryPolicy is validated.
- Final summaries require citations.
- Citations reference normalized feed item IDs.
- Provider output is validated before persistence.
- Cost telemetry is attributable.

## Receiver Expectations
- Mobile can show summary trust evidence.
- Mobile can render summary failure states.
- Generated APIs do not expose provider-specific schemas.

## Blocking Defects
- Uncited final summaries possible.
- Missing citation validation.
- Provider schema leaks into public API.
- Cost telemetry unavailable.

## Allowed Exceptions
- Larger eval corpus can grow after beta.
- Additional model providers can wait.
