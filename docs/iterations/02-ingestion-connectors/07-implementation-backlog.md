# Iteration 02 - Implementation Backlog

## Purpose

Implement ingestion as a replaceable provider platform, not as hardcoded scraping logic.

## Connector SDK Backlog

1. Define `SourceProviderPort`.
2. Define `SourceCapabilityProfile`.
3. Define `SourceQuery`.
4. Define `ScanContext`.
5. Define `ScanResult`.
6. Define `ProviderCursor`.
7. Define provider error taxonomy:
   - auth error
   - rate limited
   - quota exhausted
   - forbidden by provider
   - temporary provider failure
   - malformed provider payload
   - unsupported capability
8. Define certification tests that every connector must pass.
9. Add provider registry with capability discovery.
10. Add source acquisition policy that rejects unsafe production scraping approaches.

## First Providers Backlog

1. Implement Hacker News connector through official/open API.
2. Implement RSS connector with ETag and Last-Modified support.
3. Add normalized item mapping.
4. Add URL canonicalization.
5. Add content hashing.
6. Add source provenance fields.
7. Add fixtures for empty, malformed, duplicated and updated items.
8. Add connector health checks.

## Scheduler Backlog

1. Implement scan policy aggregate.
2. Implement interval validation and minimum safe interval.
3. Implement scan job creation.
4. Implement worker lease.
5. Implement retry/backoff.
6. Implement cursor save after successful normalized write.
7. Implement dead-letter handling.
8. Implement source binding pause/resume.
9. Implement per-tenant scan budget guard.
10. Emit scan status events.

## Feed Backlog

1. Persist raw provider payload references.
2. Persist normalized source items.
3. Deduplicate by provider ID, canonical URL and content hash.
4. Build tenant/topic feed read model.
5. Add pagination, filters and item detail.
6. Track unavailable/deleted provider states.
7. Keep source provenance visible for future citation.

## Edge Cases

- Provider cursor expires.
- RSS feed has no GUID.
- Same article appears in RSS and HN.
- Job crashes after fetch but before cursor save.
- Two workers process the same binding.
- Source returns updated item content with same ID.
- Tenant deletes topic while scan job is queued.

## Validation

- Repeated scans are idempotent.
- HN and RSS use the same provider port.
- Duplicate items do not create duplicate feed cards.
- Failed scans produce actionable status for UI and ops.

## Implemented Evidence

- PR 36 HN live-capable connector path added: scan queue commands now carry safe `providerKey` and `sourceQuery` metadata from source bindings, ingestion resolves providers through `SourceProviderRegistryPort`, and the worker registers a production-safe Hacker News provider backed by public HN Firebase listings plus HN Algolia search.
- The implementation keeps Monitoring and Ingestion separated by a queue contract. Ingestion does not import Monitoring repositories or raw source binding config, and protected credential-like config fields are not copied into scan commands.
- PR 37 RSS live-capable connector path added: RSS is now `enabled_beta`, uses an SSRF-checked HTTP client with RSS/Atom parsing, ETag/Last-Modified conditional request support, cursor propagation through scan execution and worker registration.
- Fake source remains the deterministic local provider for tests. Hacker News and RSS are enabled for beta. Reddit/X/Telegram remain readiness-profiled until approved access paths and cost/quota policies exist.
- Source provider certification is now an executable release gate: `npm run check:source-certification` verifies all `enabled_beta` providers against deterministic fixtures, writes `ops/ingestion/source-provider-certification.json`, and blocks release if certification evidence is missing or stale.
