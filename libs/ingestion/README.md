# Ingestion Context

Owns source providers, scan execution, source items, cursors, leases and source
item enrichment.

## Ubiquitous Language

- `SourceProvider`: provider implementation that validates bindings, plans a
  scan and returns source items.
- `SourceItem`: raw normalized item produced by ingestion before feed
  projection.
- `ScanAttempt`: execution record for a source scan.
- `ScanPolicy`: scheduling and quota policy owned by Monitoring, consumed by
  ingestion through commands/contracts.
- `SourceBinding`: workspace/topic binding owned by Monitoring, consumed by
  source providers as scan context.

## Context Rules

- Ingestion fetches and normalizes provider payloads but does not rank summary
  relevance.
- Provider-specific API clients and auth details stay in adapters.
- Feed projection receives source items and provider metrics after ingestion
  normalization.

Layout is fixed as:

- `domain`
- `features`
- `ports`
- `adapters`
- `interfaces`
