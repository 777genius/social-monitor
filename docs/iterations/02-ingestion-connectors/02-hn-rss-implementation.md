# Iteration 02 / Phase 02 - HN And RSS Implementation

## Objective

Implement first reliable connectors: Hacker News and RSS/Atom.

## Steps

1. Implement HN Firebase API adapter for top/new/best and item hydration.
2. Implement optional HN Algolia search adapter for keyword discovery.
3. Implement RSS/Atom adapter with conditional HTTP fetching.
4. Add SSRF-safe URL validation for feeds.
5. Normalize items into canonical source item model.
6. Store raw payload pointer in object storage.
7. Add fixtures for deleted/missing/malformed items.

## Edge Cases

- HN item missing/deleted/dead.
- RSS feed has no GUID.
- Feed date is missing or invalid.
- Redirect points to private IP.
- Same URL appears in multiple feeds.

## Pay Attention

- Use real feed parser, not regex.
- Commit cursor only after persistence.
- Keep source-specific fields in metadata/raw payload.

## Acceptance Criteria

- HN scan produces normalized items.
- RSS scan handles ETag/Last-Modified.
- Duplicate items are not inserted twice.
- Connector fixture tests pass.
