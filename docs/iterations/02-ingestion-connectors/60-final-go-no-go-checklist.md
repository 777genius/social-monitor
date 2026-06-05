# Iteration 02 - Final Go/No-Go Checklist

## Decision Scope
Decide whether ingestion is ready for summary intelligence.

## Go Conditions
- SourceProviderPort is stable.
- Fake, HN and RSS adapters pass certification.
- Feed items have stable IDs and provenance.
- Cursor behavior is safe under crash/retry.
- Provider errors are classified.

## Hold Conditions
- Advanced dashboards are incomplete.
- Future sources remain unimplemented.

## Rework Conditions
- Downstream code needs provider-specific fields.
- Cursor advances before durable persistence.
- Adapter lacks certification.
- Source path violates policy.

## Accepted Exceptions
- Reddit, X/Twitter and Telegram remain future adapters.
- Source ranking remains deferred.

## Critical Audit Evidence
- Adapter certification, cursor crash/retry and normalized feed provenance evidence is attached.
- Provider DTO leakage checks pass.
- Deferred sources remain readiness profiles, not hidden implementation dependencies.
- Raw payload deletion and citation-unavailable behavior are covered by fixtures.
- State re-check fixtures cover queued/in-flight topic/source/policy/credential/quota changes.
- Temporal fixtures cover scan interval boundaries, provider timestamp ambiguity, future timestamps and bounded backfill.

## Decision Record
Record decision as `go`, `hold` or `rework` with certification, feed snapshot and cursor evidence.
