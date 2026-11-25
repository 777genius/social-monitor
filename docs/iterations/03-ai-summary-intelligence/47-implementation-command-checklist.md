# Iteration 03 - Implementation Command Checklist

## Purpose
Record summary verification before AI pipeline changes are reviewed.

## Local Checks
- Run SummaryPolicy validation tests.
- Run structured output schema tests.
- Run citation validation tests.
- Run eval harness.
- Verify usage/cost telemetry output.

## Evidence To Attach
- Eval result.
- Valid summary with citations.
- Rejected invalid provider output.
- Cost telemetry sample.

## MVP Evidence Rule
- Required: schema validation, claim citation validation, prompt-injection fixture and cost telemetry.
- Defer: fine-tuning benchmarks and large personalization evals until beta feedback exists.

## Blocking Failures
- Final uncited summary is possible.
- Provider output persists without validation.
- Provider-specific schema leaks into domain or public API.
- Cost cannot be attributed.
