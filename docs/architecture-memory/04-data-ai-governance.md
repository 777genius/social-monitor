# Data, AI & Governance

## Core Data Model

Core entities:

```text
Tenant
User
Topic
TopicRule
SourceBinding
ScanSchedule
ScanRun
ConnectorRun
CanonicalSourceItem
NormalizedItem
ItemCluster
SummaryRule
SummaryJob
SummaryResult
Digest
ProviderHealthSnapshot
CostLedgerEntry
ComplianceDeletionEvent
```

## Canonical Source Item

Core pipeline works only with canonical fields:

```text
source_type
provider
source_account_id
external_id
canonical_url
author_external_id
conversation_external_id
parent_external_id
title
body_text
language
published_at
discovered_at
edited_at
deleted_at_source
metrics
media_refs
raw_payload_ref
content_hash
normalized_hash
schema_version
```

Provider/source-specific data stays in `raw_payload_ref`, `provider_metadata` and `source_specific_json`.

## PostgreSQL First

Use PostgreSQL as system of record.

Use:

- full-text search;
- pgvector;
- trigram indexes;
- partitioning for large append-heavy tables;
- Row Level Security readiness.

Do not introduce OpenSearch/vector DB until real scale requires it.

References:

- PostgreSQL full-text search: https://www.postgresql.org/docs/17/textsearch.html
- PostgreSQL partitioning: https://www.postgresql.org/docs/current/static/ddl-partitioning.html
- PostgreSQL RLS: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- pgvector: https://github.com/pgvector/pgvector

## Summarization

Never summarize every raw post.

Pipeline:

```text
rules/keyword filter
-> exact dedupe
-> semantic clustering
-> relevance scoring
-> summarize useful clusters only
-> digest generation
```

Summary stores:

```text
model
model_version
prompt_template_version
summary_rule_version
input_item_ids
input_cluster_id
schema_version
cost
latency
validation_status
```

References:

- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI Batch API: https://platform.openai.com/docs/guides/batch
- OpenAI embeddings: https://platform.openai.com/docs/guides/embeddings
- OpenAI rate limits: https://platform.openai.com/docs/guides/rate-limits/usage-tiers

## AI Quality & Evals

Prompt/model changes require eval gates before production rollout.

Metrics:

```text
schema_validity_rate
citation_coverage
factual_consistency
relevance_precision
duplicate_compression
summary_usefulness_score
cost_per_valid_summary
latency_p95
```

References:

- OpenAI Evals API: https://platform.openai.com/docs/api-reference/evals
- OpenAI evaluation best practices: https://platform.openai.com/docs/guides/evaluation-best-practices
- Great Expectations: https://docs.greatexpectations.io/docs/0.18/reference/learn/terms/checkpoint
- Evidently: https://docs.evidentlyai.com/docs/platform/monitoring_overview

## Cost Governance

Cost is product data, not only infra telemetry.

Track:

```text
tenant_id
user_id nullable
topic_id nullable
source_type
provider
operation_type
units
unit_cost
total_cost_usd
model nullable
connector_run_id nullable
summary_job_id nullable
occurred_at
```

Stripe may be used for billing, but internal usage/cost ledger is runtime source of truth.

Reference:

- OpenCost: https://opencost.io/docs/

