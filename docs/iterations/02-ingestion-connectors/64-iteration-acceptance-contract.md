# Iteration 02 - Iteration Acceptance Contract

## Provider
Ingestion team provides provider ports, certified adapters, normalized feed and scan status behavior.

## Receiver
Iteration 03 summary team receives feed data and provenance needed for summaries.

## Handoff Promises
- Feed items are normalized and provider-neutral.
- Feed items include stable identity and provenance.
- Cursor behavior is safe under retry and crash.
- Provider errors are classified.
- HN/RSS/fake providers pass certification.

## Receiver Expectations
- Summary pipeline can ignore provider-specific payloads.
- Evidence selection can cite feed item IDs.
- Scan failures can affect summary status clearly.

## Blocking Defects
- Provider-specific fields required downstream.
- Adapter not certified.
- Cursor unsafe under crash/retry.
- Source not policy-approved.

## Allowed Exceptions
- Reddit, X/Twitter and Telegram remain future adapters.
- Advanced source dashboards can wait.
