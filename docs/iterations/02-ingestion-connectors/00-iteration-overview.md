# Iteration 02 - Ingestion Connectors Overview

## Goal

Implement source ingestion as a replaceable provider system, not as hard-coded scrapers.

This iteration makes the first reliable data flow: topic/source binding creates scan jobs; connectors fetch allowed sources; items normalize; cursors persist; feed read models expose results.

## MVP Source Order

1. Hacker News - official Firebase/API plus Algolia where needed.
2. RSS/Atom/open web - responsible feed polling and page extraction only where allowed.
3. GitHub - issues, discussions, repos, search/events depending on API limits.
4. Reddit - official API or approved access path; do not assume broad commercial access.
5. YouTube basic - Data API search/channel/comment monitoring with quota controls.

## Provider Contract

Every provider must declare:

- capabilities
- auth model
- supported query types
- cursor model
- rate-limit model
- backfill limits
- media/comment support
- data retention rights
- AI summary permission
- source risk classification

## MVP Source Readiness Policy

Source support has two separate states: `documented readiness` and `production enabled`.

| Source | MVP State | Allowed Path | Notes |
| --- | --- | --- | --- |
| Fake provider | enabled | deterministic local adapter | proves architecture, certification and retry behavior |
| Hacker News | enabled | official/open APIs | first real low-risk social/news source |
| RSS/Atom | enabled | feed polling with ETag/Last-Modified and site policy respect | open-web source, not universal page scraping |
| GitHub | readiness profile | official API | add after HN/RSS loop is stable if quota/use case is clear |
| Reddit | readiness profile | official API, approved commercial/vendor path | do not assume broad monitoring access |
| X/Twitter | readiness profile | approved paid/API/vendor path | no production path without clear policy/cost |
| YouTube | readiness profile | Data API with quota budget | useful but quota-sensitive |
| Telegram | readiness profile | bot/channel API or approved export/vendor path | add only with clear auth/content-scope model |

Rules:

1. A source can be documented without being enabled.
2. A source cannot be enabled until acquisition mode, quota, cursor, identity, retention and user-visible limitations are known.
3. Adapter implementation starts only after the source passes readiness review and the shared certification suite has provider-specific fixtures.
4. Unsupported sources appear in UI/API as unavailable/limited states, not as broken scan attempts.
5. The MVP rejects unsafe production scraping and any approach that depends on bypassing platform controls.

## Connector Certification Matrix

Every adapter must pass the same behavioral checks:

| Area | Required Evidence |
| --- | --- |
| Capability profile | query modes, content units, cursor model, quota model and limitations are declared |
| Identity | stable provider id, canonical URL or documented composite fallback |
| Cursor safety | repeated scan, partial scan and crash-before-cursor tests pass |
| Rate limits | retryable vs non-retryable limit behavior is classified |
| Errors | provider errors map to stable platform failure classes |
| Normalization | provider DTOs do not leak past adapter mapper |
| Dedupe inputs | provider id, canonical URL and content hash are populated when available |
| Tenant safety | scan context always includes tenant/workspace/topic/source binding |
| Cost/quota | scan result reports quota/cost hints when provider exposes them |
| Provenance | user/support can trace item to source without exposing secrets |

## Phase Map

1. `01-connector-sdk.md` - source provider port, capability profile and tests.
2. `02-hn-rss-implementation.md` - first low-risk sources.
3. `03-scheduler-and-jobs.md` - scan orchestration, queues, retries, leases.
4. `04-feed-dedupe-read-model.md` - normalized feed, dedupe, read model.

## Detailed Steps

1. Define `SourceProviderPort` and source-specific adapters.
2. Define `ScanPolicy` with interval, backfill window, max items and cost budget.
3. Define `SourceBinding` from topic to provider/query.
4. Define provider-neutral `SourceQuery`.
5. Define scan cursor storage with versioned cursor payload.
6. Define item normalization schema.
7. Implement fake provider for certification tests.
8. Implement HN provider.
9. Implement RSS provider with feed parsing and ETag/Last-Modified support.
10. Implement scheduler that emits `ScanRequested`.
11. Implement worker that claims scan jobs with lease/fencing.
12. Persist raw provider metadata separately from normalized item fields.
13. Add dedupe by canonical URL, provider id and content fingerprint.
14. Build feed read model for topic timeline.
15. Add scan status and failure reason API.
16. Add source readiness records for Reddit, X/Twitter, Telegram, GitHub and YouTube without enabling production scans.

## Edge Cases

- Feed item has no stable guid.
- Source returns duplicate items across pages.
- Provider cursor expires.
- Feed has invalid XML/Atom.
- Source returns future timestamps.
- Item was deleted or no longer available.
- Provider returns partial results but no error.
- Topic has multiple bindings producing the same item.
- Rate limit is per app, per tenant, or per token.
- Scan interval is lower than provider allows.
- Provider changes cursor semantics after adapter release.
- Source returns items in non-monotonic order.
- Provider returns item edits without new item id.
- Two tenants monitor same source query but have different quotas and credentials.
- Source is allowed for personal use but not for multi-tenant/commercial usage.
- Manual scan and scheduled scan overlap for the same source binding.

## What To Watch

- Do not hide source limitations from users.
- Do not merge raw provider DTOs into domain entities.
- Do not retry non-retryable provider errors.
- Do not allow one tenant's expensive topic to starve others.
- Every scan must have correlation id, source id, topic id and tenant id.
- Do not promote readiness-profile sources into enabled sources without ADR/source approval.
- Do not let connector-specific behavior leak into Feed or Summary use cases.
- Treat cursor commit as a data-loss boundary, not as a simple metadata update.

## Quality Gates

- Fake provider certification suite passes.
- HN and RSS use the same port.
- Scheduler can pause/resume source bindings.
- Cursor recovery is tested.
- Dedupe tests cover URL, id and content-hash collisions.
- Feed API returns stable pagination.
- Source readiness profile exists for each planned future source.
- HN/RSS adapter certification includes provider-specific fixtures and repeated-scan evidence.

## Done Criteria

Iteration 02 is complete when a user can create a topic, bind HN/RSS sources, run scheduled scans, and see normalized deduped items with source status and provenance.
