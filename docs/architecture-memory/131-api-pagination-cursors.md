# 131. API Pagination and Cursors

## Status

Locked for API baseline.

## Research Anchors

- JSON:API cursor pagination profile: https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
- Relay Cursor Connections Specification: https://relay.dev/graphql/connections.htm

## Decision

Use cursor pagination for feed, summaries, audit events and deliveries. Offset pagination is allowed only for small administrative lists where ordering is stable and scale is bounded.

## Cursor Rules

Cursor payload is opaque to clients and signed or encrypted by backend.

Cursor includes:

- query version;
- sort key values;
- direction;
- page size;
- tenant scope;
- filters hash;
- expiry where needed.

Clients must not parse cursors. Backend may change cursor internals without API version change.

## Sorting

Use deterministic composite sorting:

```text
published_at desc, source_kind asc, source_item_id asc
created_at desc, id desc
score desc, published_at desc, id desc
```

Every paginated query must have a stable tie-breaker.

## Feed Policy

For live feeds, new items can appear before the current page. Cursor pagination should preserve page consistency enough for browsing, but realtime updates should notify the client to refresh from the top instead of mutating every open page.

## Best-Fact Choice

Cursor pagination is the default because the product is feed/search heavy and multi-tenant. Offset pagination becomes slow and inconsistent as data grows.

