# 118. Search and Indexing Pipeline

## Status

Locked for implementation blueprint.

## Research Anchors

- OpenSearch index templates: https://docs.opensearch.org/latest/api-reference/index-apis/index-templates/
- OpenSearch aliases: https://docs.opensearch.org/latest/api-reference/index-apis/alias/
- pgvector documentation: https://github.com/pgvector/pgvector

## Decision

Start with Postgres full-text search and pgvector for MVP. Add OpenSearch when query complexity, scale or operational need justifies it.

## Indexing Flow

```text
item.normalized.v1 -> projection worker -> feed/search tables
summary.created.v1 -> projection worker -> summary search table
embedding.created.v1 -> vector table/index
```

All projections are idempotent and rebuildable.

## Postgres MVP

Use:

- normalized tables for feed;
- `tsvector` columns for text search where needed;
- pgvector for semantic similarity;
- HNSW indexes when corpus and latency justify approximate search;
- exact search fallback for small datasets and correctness tests.

## OpenSearch Later

When adopted:

- use index templates for mappings/settings;
- write through versioned indexes;
- read through aliases;
- rebuild into a new index and atomically move alias;
- never mutate mappings casually in place;
- keep Postgres id as projection reference.

Index naming:

```text
feed-items-v001
summaries-v001
clusters-v001
alias: feed-items-current
```

## Rebuild Policy

Every projection supports:

- full rebuild by tenant;
- full rebuild by index version;
- bounded backfill;
- pause/resume cursor;
- comparison counts against canonical Postgres records.

## Best-Fact Choice

Do not introduce OpenSearch just because it is powerful. Use Postgres/pgvector until product search needs justify another operational system.

