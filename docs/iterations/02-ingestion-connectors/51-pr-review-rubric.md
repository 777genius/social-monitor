# Iteration 02 - PR Review Rubric

## Review Goal
Ensure ingestion PRs add reliable provider behavior without leaking source-specific details downstream.

## Architecture Checks
- Adapter implements SourceProviderPort.
- Feed domain stores normalized data only.
- Scheduler calls use cases, not provider SDKs directly.
- Source policy is respected.

## Test And Evidence Checks
- Connector certification passes.
- Normalized feed snapshot is reviewed.
- Cursor crash/retry behavior is covered.
- Provider errors map to taxonomy.

## Edge Case Checks
- Duplicate or reordered provider items.
- Missing external ID.
- Malformed response.
- Overlapping scans.

## Merge Blockers
- Provider payload leaks into feed domain.
- Cursor advances before durable persistence.
- Adapter lacks certification.
- Source path is not policy-approved.
