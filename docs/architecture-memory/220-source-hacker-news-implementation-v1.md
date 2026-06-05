# 220 - Source Hacker News Implementation V1

## Decision

Hacker News V1 uses the official Firebase-backed Hacker News API for canonical item retrieval.

Search is optional and must be behind a separate adapter because HN's official API and Algolia-powered HN search have different contracts.

## Sources

- Official Hacker News API repository: https://github.com/HackerNews/API
- Hacker News Firebase endpoint: https://hacker-news.firebaseio.com/v0/
- HN Search by Algolia about page: https://hn.algolia.com/about
- Algolia Search API docs: https://www.algolia.com/doc/api-reference/search-api/

## Connector Role

HN is the low-risk initial source for proving ingestion, normalization, dedupe, summary and digest flows.

It should be implemented before high-friction commercial social providers.

## Supported V1 Capabilities

Official API:

- top stories
- new stories
- best stories
- item by id
- user by id only if needed
- max item id for incremental discovery

Optional search adapter:

- query search
- time-bounded topic discovery
- relevance candidate generation

Search results must be rehydrated through canonical item retrieval where practical.

## Data Model Mapping

HN item maps to canonical `SourceItem`:

- provider item id
- source type `hacker_news`
- title
- text where present
- url
- author id as provider author reference
- score
- descendants/comment count
- item type
- created timestamp
- parent/story id for comments
- raw payload pointer

HN comments can be represented using the conversation/comment model already defined in project memory.

## Cursor Strategy

For listing scans:

```text
source = hacker_news
feed = top|new|best
last_seen_ids = bounded set
last_scan_at
```

For incremental max-id scans:

```text
last_max_item_id
scan_window_start_id
scan_window_end_id
```

The max-id path must be bounded because historical catch-up can become expensive even for a simple API.

## Reliability Policy

HN API is simple, but still requires:

- timeout policy
- bounded concurrency
- per-source queue limits
- retry with jitter
- fixture-based replay
- item-level idempotency

Do not assume every referenced item is available or complete.

## Topic Matching

HN should exercise the common topic DSL:

- keyword rules
- domain rules
- author rules where permitted
- score thresholds
- time windows
- include/exclude terms

Rules must compile to provider-neutral matching first. Provider-side search is an optimization, not product truth.

## Summary Policy

HN summaries should cite item title and URL/permalink, and distinguish:

- story content
- top comments
- community reaction
- score/comment count signals

Comment summaries must be bounded by max comment count and token budget.

## Testing

Required:

- official API item fixtures
- deleted/dead/missing item fixtures
- story/comment tree fixtures
- dedupe tests across URL/title variants
- topic DSL matching tests
- scan resume tests

## Non-Goals

- No user tracking product.
- No unbounded comment-tree ingestion.
- No assumption that Algolia search is canonical HN state.
- No HN-specific domain leakage into product core.
