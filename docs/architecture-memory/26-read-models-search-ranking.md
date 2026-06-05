# Read Models, Search & Ranking

Date: 2026-05-31
Status: baseline read model/search memory

## Decision

Use explicit read models for UI/feed/search rather than querying normalized write tables directly for every screen.

Postgres remains the first system of record and first search platform.

## Read Model Types

```text
feed_item_read_model
topic_summary_read_model
scan_run_read_model
source_health_read_model
digest_read_model
admin_ops_read_model
```

## Postgres First

Use:

- regular tables maintained by consumers/jobs for hot read models;
- materialized views for low-frequency reporting or admin views;
- full-text search for early search;
- pgvector for similarity/semantic features;
- trigram indexes for fuzzy matching.

PostgreSQL materialized views persist query results like table-like relations. They are useful, but not a universal incremental read-model solution.

Reference:

- PostgreSQL Materialized Views: https://www.postgresql.org/docs/17/rules-materializedviews.html

## When To Add OpenSearch

Add OpenSearch only when Postgres search becomes a proven bottleneck:

- millions/tens of millions of searchable docs;
- complex faceted search;
- heavy full-text analytics;
- search workload hurts transactional DB;
- search relevance tuning becomes a product requirement.

OpenSearch has dedicated relevance tooling, but it is additional operational surface area and should not be first by default.

Reference:

- OpenSearch search relevance: https://docs.opensearch.org/docs/2.19/search-plugins/search-relevance/index/

## Ranking

Feed ranking should be deterministic, explainable and testable.

Signals:

```text
published_at
discovered_at
source_priority
topic_match_score
semantic_relevance_score
engagement_metrics
dedupe_cluster_size
summary_available
user_feedback
source_quality_score
```

Do not let an opaque LLM directly rank the feed without logged features and fallback ranking.

## Locked Decisions

1. UI uses read models for hot paths.
2. Postgres search/read models first.
3. Materialized views are for selected reporting/admin use, not every live read path.
4. OpenSearch is later, after measured need.
5. Feed ranking must be explainable and testable.

