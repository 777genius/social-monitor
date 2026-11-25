# 231 - Postgres Search Indexing Strategy

## Decision

Use PostgreSQL full-text search for V1 normalized feed and summary search.

Do not introduce OpenSearch/Elasticsearch as a default dependency until search workload or ranking requirements exceed Postgres capabilities.

## Sources

- PostgreSQL full-text search indexes: https://www.postgresql.org/docs/current/textsearch-indexes.html
- PostgreSQL GIN indexes: https://www.postgresql.org/docs/current/gin.html
- PostgreSQL text search controls: https://www.postgresql.org/docs/current/textsearch-controls.html
- PostgreSQL table partitioning: https://www.postgresql.org/docs/current/ddl-partitioning.html

## Searchable Data

Search indexes cover:

- normalized source item title
- normalized source item body/excerpt
- source community/channel/feed name
- summary title
- summary key points
- tags/classification labels

Raw payloads are not directly searched by default.

## Index Policy

Use stored/generated `tsvector` columns where query volume justifies it.

Use GIN indexes for full-text search fields because PostgreSQL documents GIN as the preferred full-text index type for regular searches.

Example shape:

```sql
search_vector tsvector
```

Index:

```sql
CREATE INDEX source_items_search_gin
ON source_items
USING GIN (search_vector);
```

## Tenant Filtering

Every search query includes tenant filtering before or alongside text ranking.

Required filters:

- `tenant_id`
- source binding visibility
- retention/deletion state
- access scope

Do not return globally ranked results and then filter in application memory.

## Ranking

V1 ranking is a composite:

```text
text_rank
recency_score
source_weight
engagement_signal
topic_match_score
```

Keep rank calculation explainable and testable.

## Language

Store item language when available.

Use language-specific text search configuration only when confidence is high. Otherwise use a conservative/default configuration and avoid over-stemming multilingual content.

## Pagination

Use cursor/keyset pagination for feed search.

Offset pagination is allowed only for low-volume admin views.

Cursor should include:

- rank/score
- created_at
- item id

## Partitioning

Large append-heavy tables should be prepared for time-based or tenant/time partitioning.

Partition only when volume justifies operational complexity. Premature partitioning can make migrations and indexes harder.

## When To Add OpenSearch

Add OpenSearch only if at least one is true:

- Postgres search latency misses SLO after tuning.
- Complex faceting/ranking is needed.
- Cross-field relevance tuning becomes central product value.
- Search traffic starts competing with transactional workload.
- Search index size/refresh requirements harm database operations.

## Architecture Rule

Postgres is the V1 source of truth and first search engine.

External search is a projection, never the canonical store.
