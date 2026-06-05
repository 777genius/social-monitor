# Analytics, Experimentation & Feature Flags

Date: 2026-05-31
Status: baseline analytics memory

## Decision

Product analytics events must be schema-governed, not ad hoc tracking calls.

Start with an internal event table. Add Snowplow/PostHog only when product analytics and experimentation needs justify the platform weight.

References:

- Snowplow self-describing schemas: https://docs.snowplow.io/docs/fundamentals/schemas/
- Snowplow events/entities: https://docs.snowplow.io/docs/understanding-tracking-design/understanding-events-entities/

## Required Analytics Events

```text
topic.created.v1
source_binding.created.v1
scan_frequency.changed.v1
feed_item.opened.v1
summary.saved.v1
summary.dismissed.v1
summary.regenerated.v1
digest.opened.v1
digest.clicked.v1
alert.marked_false_positive.v1
connector_error_seen_by_user.v1
```

Each event needs:

- schema;
- version;
- owner;
- retention policy;
- PII classification;
- product question it answers.

## Feature Flags

Feature flags are control plane, not just UI toggles.

Use flags for:

```text
enable_x_official_connector
enable_x_provider_fallback
enable_reddit_backfill
enable_batch_summaries
enable_expensive_embedding_model
enable_connector_version_v2
enable_new_dedupe_algorithm
enable_new_summary_prompt
```

Reference:

- OpenFeature provider concept: https://openfeature.dev/docs/reference/concepts/provider

## Experimentation

Allowed experiments:

- onboarding flow;
- summary display layout;
- digest frequency suggestions;
- relevance ranking thresholds;
- summary prompt/model variants.

Guardrails:

- do not experiment on compliance deletion;
- do not experiment on tenant isolation/auth;
- do not run expensive model experiments without budget guard;
- do not silently change source acquisition behavior for all tenants.

## Flag Evaluation Context

```text
tenant_id
plan
region
source_type
provider
risk_level
internal_user
budget_remaining
```

## Locked Decisions

1. Analytics events are schema-versioned.
2. Start analytics internally; add analytics platform later when useful.
3. Feature flags are part of control plane.
4. High-risk connector/model changes require flagged rollout.
5. Experiments must have budget and safety guardrails.

