# 232 - Vector Search pgvector/OpenSearch Boundary

## Decision

Use pgvector first for embeddings and semantic search in V1/V2.

Move vector search to OpenSearch or a dedicated vector database only when data size, query shape, isolation or operations prove that Postgres is no longer the right place.

## Sources

- pgvector README: https://github.com/pgvector/pgvector
- pgvector indexing docs: https://github.com/pgvector/pgvector#indexing
- OpenSearch k-NN documentation: https://docs.opensearch.org/latest/query-dsl/specialized/k-nn/
- OpenSearch vector search docs: https://docs.opensearch.org/latest/vector-search/

## V1 Use Cases

pgvector supports:

- semantic dedupe candidate lookup
- related item discovery
- summary context retrieval
- topic rule suggestions
- cluster similarity

It is not initially used as the only retrieval mechanism. Combine it with keyword, source and time filters.

## Embedding Storage

Store embeddings with:

- tenant id
- source item id
- embedding model id
- embedding dimension
- content hash
- created_at
- deleted_at/null

Do not mix embeddings from different models in the same comparable vector space without model metadata.

## Index Choice

pgvector supports exact search and approximate indexes such as HNSW and IVFFlat.

V1 starts without approximate index until volume requires it.

When adding approximate indexes:

- HNSW for stronger recall/latency on many interactive searches
- IVFFlat when build/memory tradeoffs fit and data distribution is understood

Benchmark with tenant filters because filtered vector search can behave differently from global vector search.

## Query Pattern

Semantic search must include:

- tenant filter
- deletion/retention filter
- source visibility filter
- time window where relevant
- vector similarity threshold or top-k cap

Never run unbounded global nearest-neighbor search across all tenants.

## Move-To-OpenSearch Criteria

Consider OpenSearch/vector service when:

- vector search requires independent scaling
- hybrid lexical/vector ranking becomes core product behavior
- Postgres CPU/IO contention appears
- index size exceeds operational comfort
- low-latency filtered k-NN at larger scale is required
- search team needs separate deployment/reindex pipeline

## Projection Rule

If OpenSearch is introduced:

```text
Postgres truth -> outbox event -> search index projection
```

OpenSearch is rebuilt from Postgres/object storage. It is not the source of truth.

## Reindexing

Embedding model changes require:

- new embedding model version
- background re-embed job
- dual-read/dual-index migration window if needed
- quality comparison before switch
- old embedding retention/deletion policy

## Cost Controls

Embedding generation is rate and budget limited.

Do not embed:

- duplicate items
- deleted items
- raw payloads outside retention policy
- content below quality threshold
- content not needed for tenant features

## Architecture Rule

Use pgvector to avoid premature infrastructure sprawl.

Graduate to OpenSearch/vector service when measured workload, not preference, demands it.
