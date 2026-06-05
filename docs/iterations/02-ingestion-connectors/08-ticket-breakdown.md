# Iteration 02 - Ticket Breakdown

## Phase 01 - Connector SDK

### T02-01 - Build Source Provider Port

- Context: Ingestion/Source Catalog
- Layer: Domain/application port
- Artifacts: `SourceProviderPort`, capability profile, scan result types
- Steps:
  1. Define provider identity and capability discovery.
  2. Define query, cursor, scan context and normalized result.
  3. Define provider error taxonomy.
  4. Define certification test contract.
- Edge cases:
  - Provider supports listing but not search.
  - Cursor expires or is invalidated by provider.
  - Provider returns comments and posts with different semantics.
- Acceptance:
  - Fake provider passes certification tests.

### T02-02 - Implement Provider Registry

- Context: Source Catalog
- Layer: Application/infrastructure
- Artifacts: registry, capability persistence, source status
- Steps:
  1. Register adapters by provider key.
  2. Persist capability profile.
  3. Expose source catalog API.
  4. Add health status and warnings.
- Edge cases:
  - Adapter unavailable at startup.
  - Capability profile changes after user created binding.
- Acceptance:
  - UI can list supported source capabilities.

## Phase 02 - HN/RSS Implementation

### T02-03 - Implement Hacker News Adapter

- Context: Ingestion
- Layer: Provider adapter
- Artifacts: HN adapter, fixtures, mapper tests
- Steps:
  1. Fetch stories through open API.
  2. Normalize IDs, title, URL, text, score, comments and timestamps.
  3. Handle deleted/dead items.
  4. Add fixture-based tests.
- Edge cases:
  - Story has no URL.
  - Comments arrive after first scan.
  - Item disappears or is marked dead.
- Acceptance:
  - HN produces normalized source items idempotently.

### T02-04 - Implement RSS Adapter

- Context: Ingestion
- Layer: Provider adapter
- Artifacts: RSS adapter, ETag/Last-Modified support, parser tests
- Steps:
  1. Parse RSS/Atom feeds.
  2. Support conditional requests.
  3. Normalize GUID/link/title/date/content.
  4. Canonicalize URLs.
  5. Add malformed feed fixtures.
- Edge cases:
  - Missing GUID.
  - Malformed date.
  - Same item content updates.
- Acceptance:
  - Repeated scans do not duplicate items.

## Phase 03 - Scheduler And Jobs

### T02-05 - Implement Scan Scheduler

- Context: Ingestion
- Layer: Application/worker
- Artifacts: scan policy aggregate, job producer, worker lease
- Steps:
  1. Validate scan intervals.
  2. Generate due scan jobs.
  3. Claim jobs with lease.
  4. Apply retry/backoff and dead-letter behavior.
  5. Save cursor only after durable item write.
- Edge cases:
  - Worker crashes mid-scan.
  - Two workers claim same job.
  - Tenant quota exhausted mid-run.
- Acceptance:
  - Scheduler runs repeatedly without duplicate processing.

## Phase 04 - Feed Dedupe Read Model

### T02-06 - Build Normalized Feed

- Context: Feed
- Layer: Application/persistence/read model
- Artifacts: feed item schema, dedupe service, REST endpoints
- Steps:
  1. Store raw provider metadata reference.
  2. Store normalized item.
  3. Deduplicate by provider ID, canonical URL and content hash.
  4. Build topic feed read model.
  5. Add pagination and filters.
- Edge cases:
  - Same link appears in RSS and HN.
  - URL differs by tracking params.
  - Provider ID collision across providers.
- Acceptance:
  - Feed is tenant-scoped, deduped and provenance-rich.
