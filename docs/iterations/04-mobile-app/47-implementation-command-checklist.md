# Iteration 04 - Implementation Command Checklist

## Purpose
Record mobile verification before feature-slice changes are reviewed.

## Local Checks
- Run Flutter analyze.
- Run generated client compatibility check.
- Run DTO mapper tests.
- Run MobX store tests.
- Run UI state scenarios for loading, empty, error, stale and offline.

## Evidence To Attach
- Analyze/test output.
- Generated client diff.
- Mapper/store test output.
- Screenshots or golden evidence for core states.

## MVP Evidence Rule
- Required: mapper/store tests and screenshots/goldens for core loading, empty, error, stale and offline states.
- Defer: exhaustive visual matrix and non-core device coverage until beta usage shows risk.

## Blocking Failures
- DTO crosses into domain.
- Store owns business rules.
- Failure state is not visible.
- Core loop cannot be completed.
