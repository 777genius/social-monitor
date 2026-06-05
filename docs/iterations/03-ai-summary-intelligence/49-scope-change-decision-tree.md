# Iteration 03 - Scope Change Decision Tree

## Decision Goal
Prevent AI changes from weakening citations, validation or cost control.

## Accept Now If
- Change improves citation validation.
- Change improves structured output safety.
- Change improves eval coverage or cost telemetry.

## Defer If
- Change adds advanced personalization beyond MVP summary rules.
- Change adds extra providers before the provider port is stable.
- Change adds non-critical summary formats.

## Escalate To ADR If
- Change alters final summary trust rules.
- Change changes AI provider strategy.
- Change changes citation schema consumed by mobile.

## Block If
- Change allows uncited final summaries.
- Change persists unvalidated provider output.
- Change leaks provider-specific schema into domain or public API.

## Required Record
- Citation impact.
- Eval impact.
- Cost impact.
- Mobile/API contract impact.
