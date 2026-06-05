# Iteration 02 - Traceable Evidence Register

## Evidence Goal
Prove that ingestion produces certified, normalized and provider-neutral feed data.

## Critical Audit Evidence
- Source adapters pass certification before production enablement.
- Cursor commit is proven safe by crash/retry evidence.
- Provider DTOs stop at adapters and do not leak into feed/summary/mobile contracts.
- Source readiness profiles exist for deferred Reddit, X/Twitter, Telegram and other future sources.
- Raw payload, source item, feed item and citation-unavailable retention behavior is tested.
- Queued/in-flight state change fixtures prove topic/source disable, credential revoke, policy change and quota exhaustion behavior.
- Fake-clock and provider timestamp fixtures prove interval, cursor, future timestamp and backfill boundary behavior.

## Decision Evidence
- SourceProviderPort decision.
- Capability profile format.
- Cursor commit semantics.
- Normalized feed schema.
- Approved MVP sources.

## Ticket Evidence
- Adapter tickets link to certification output.
- Cursor tickets link to crash/retry scenarios.
- Feed tickets link to normalized item snapshots.
- Source tickets link to policy approval.

## Review Evidence
- Connector certification results are reviewed.
- Source policy owner approval is recorded.
- Summary lead confirms provenance is sufficient.

## Handoff Evidence
- Summary iteration accepts normalized feed contract.
- Operations accepts scan failure taxonomy.

## Missing Evidence Blocks
- Adapter without certification.
- Feed item without provenance.
- Cursor behavior without retry evidence.
- Temporal scan behavior without fake-clock/window-boundary evidence.
