# Iteration 01 - Implementation Command Checklist

## Purpose
Record platform checks before scaffold, contract or migration work is reviewed.

## Local Checks
- Run monorepo build.
- Run lint and unit tests.
- Run import-boundary checks.
- Run database migrations from clean state.
- Run migration upgrade path.
- Generate OpenAPI artifact.

## Evidence To Attach
- Build/test/lint output.
- Migration output.
- OpenAPI diff or generated artifact.
- Idempotency/outbox test result.

## MVP Evidence Rule
- Required: build, import-boundary test, migration proof and OpenAPI generation.
- Defer: full deployment pipeline and large load tests until hardening.

## Blocking Failures
- Domain imports framework or infrastructure.
- Migration is not repeatable.
- OpenAPI cannot be generated.
- Duplicate command creates duplicate durable effect.
