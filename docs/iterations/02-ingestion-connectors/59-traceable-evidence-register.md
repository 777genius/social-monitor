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
- Feed item without provenance.
- Cursor behavior without retry evidence.
- Temporal scan behavior without fake-clock/window-boundary evidence.

## Source Provider Certification Gate Evidence

- Gate: `npm run check:source-certification`
- Evidence artifact: `ops/ingestion/source-provider-certification.json`
- Certified beta providers: `fake-source`, `hacker-news`, `rss`
- Deferred providers: `reddit`, `x-twitter`, `telegram`

Verified guarantees:

- every `enabled_beta` source profile has a deterministic certification case;
- provider capability profile matches readiness profile for cursor, quota and identity strategy;
- unsupported query modes are rejected before scanning;
- fixture scans return normalized items with stable external IDs, HTTP canonical URLs and valid timestamps;
- cursor-based providers return non-empty cursors;
- repeated fixture scans are deterministic and provider errors are classified.

## PR 36 Hacker News Live-Capable Connector Evidence

- `df24a04 feat: enable hacker news scan provider path`

Verified commands:

- `npm run build`
- `env NODE_OPTIONS=--max-old-space-size=1024 npx jest --config jest.config.ts --runInBand libs/monitoring/adapters/queue/in-memory-scan-queue.adapter.spec.ts libs/monitoring/features/request-scan/request-scan.use-case.spec.ts libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case.spec.ts libs/ingestion/features/execute-scan/execute-scan.use-case.spec.ts libs/ingestion/adapters/source/registry-source-fetcher.adapter.spec.ts libs/ingestion/adapters/source/in-memory-source-provider.registry.spec.ts libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider.spec.ts libs/contracts/events/event-catalog.spec.ts`
- `timeout 120s node -r ts-node/register -r tsconfig-paths/register - <<'NODE' ...` standalone AppModule/worker/supertest smoke verified REST HN source binding, queue `providerKey/sourceQuery` payload, worker provider-registry execution using deterministic HN fixture client, feed REST visibility and scan status success.
- `timeout 45s node -r ts-node/register -r tsconfig-paths/register - <<'NODE' ...` live HTTP smoke verified `HttpHackerNewsClient.listStories('top', 2)` through public HN Firebase API and `HttpHackerNewsClient.searchStories('monitoring', 2)` through HN Algolia search without API keys.
- `npm run check:architecture`
- `npm run check:events`
- `npm run check:code-quality`
- `npm run check:release`
- `git diff --check`

Evidence notes:

- `EnqueueScanCommand` and `FetchSourceItemsCommand` now include safe `providerKey` and `sourceQuery` metadata.
- `RequestScanUseCase` and `ScheduleDueScansUseCase` derive source query metadata from source binding config through a small presentation-safe helper, falling back to binding id when no safe query field exists.
- `ExecuteScanCommandHandler` rejects malformed provider/query payloads at the queue adapter boundary before calling the use case.
- `RegistrySourceFetcherAdapter` resolves the requested provider through `SourceProviderRegistryPort`; `ExecuteScanUseCase` remains provider-neutral.
- `HttpHackerNewsClient` uses public HN Firebase listing endpoints for `top/new/best/ask/show/job` and HN Algolia `search_by_date` for keyword search; no API key or paid API is required for this MVP HN path.
- `HackerNewsSourceProvider` is now `productionSafe: true` and readiness profile state is `enabled_beta`.
- RSS enablement is covered by PR 37 evidence below.

## PR 37 RSS Live-Capable Connector Evidence

- `87786eb feat: enable rss scan provider path`

Verified commands:

- `npm run build`
- `npm run check:rss-smoke`
- `npm run test -- libs/ingestion/adapters/source/rss/http-rss-client.spec.ts libs/ingestion/adapters/source/rss/rss-source.provider.spec.ts libs/ingestion/features/execute-scan/execute-scan.use-case.spec.ts libs/ingestion/adapters/source/registry-source-fetcher.adapter.spec.ts libs/ingestion/adapters/source/in-memory-source-provider.registry.spec.ts libs/monitoring/features/shared/source-binding-scan-query.spec.ts libs/monitoring/adapters/queue/in-memory-scan-queue.adapter.spec.ts libs/monitoring/features/request-scan/request-scan.use-case.spec.ts libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case.spec.ts`
- `npm run test:e2e -- test/e2e/source-profiles.list.e2e-spec.ts --verbose`
- `node -r ts-node/register -r tsconfig-paths/register - <<'NODE' ...` live HTTP smoke verified `HttpRssClient.readFeed('https://hnrss.org/frontpage', 2)` parses real public RSS without API keys and receives cursor metadata.
- `node scripts/run-with-timeout.mjs --timeout-ms 1000 -- node -e "setTimeout(() => {}, 10000)"` verified the hard timeout guard exits with code `124` for hung commands.
- `npm run check:architecture`
- `npm run check:events`
- `npm run check:code-quality`
- `npm run check:release`
- `git diff --check`

Evidence notes:

- RSS source bindings now derive safe queue metadata as `{ mode: 'url', query: feedUrl }` without exposing raw protected config fields.
- `FetchSourceItemsCommand` accepts the last committed cursor, and `ExecuteScanUseCase` passes it to the provider before saving a new cursor after successful source item/feed projection.
- `HttpRssClient` validates initial and final redirect URLs through the feed URL policy, rejects private/local network targets, sends conditional `If-None-Match` and `If-Modified-Since` headers and parses RSS 2.0 plus Atom entries through `fast-xml-parser`.
- `RssSourceProvider` is now `productionSafe: true`; readiness profile state is `enabled_beta`, with cursor model `etag_last_modified`.
- `scripts/run-with-timeout.mjs` is now the hard guard behind `npm test` and `npm run test:e2e`, so Jest/Nest open handles fail explicitly instead of blocking implementation progress indefinitely.
- Inner-loop testing cadence is locked in code quality docs: implement coherent vertical MVP slices, use fast smoke checks for expensive paths and run targeted Jest e2e only at critical REST/worker boundaries or before boundary-changing commits.
