# Provider Routing & Quality Scoring

Date: 2026-05-31
Status: baseline provider routing memory

## Decision

Provider selection must be policy-driven and quality/cost aware, not hardcoded.

This is especially important for X/Twitter and any source where official API, provider API, import and future stream options may coexist.

## Provider Registry

```text
source_type
provider_id
provider_kind
auth_type
capabilities
cost_model
rate_limit_model
risk_level
certification_status
enabled
default_priority
```

Provider kinds:

```text
official_api
provider_api
provider_job
provider_stream
public_feed
manual_import
browser_sidecar_optional
```

## Provider Score

Track:

```text
health_score
cost_per_1000_items
latency_p50
latency_p95
field_completeness
error_rate
empty_result_rate
duplicate_rate
freshness_lag
policy_risk
summary_usefulness_downstream
```

## Routing Policy

Example:

```text
prefer: official
fallback: provider
max_cost_usd_per_day: N
max_freshness_lag_minutes: N
allow_browser_connector: false
min_field_completeness: 0.85
max_error_rate: 0.05
```

## Failover Rules

Failover is allowed only when:

- policy allows fallback;
- budget allows fallback;
- fallback provider is certified;
- provider health is above threshold;
- source policy permits use case.

Do not silently switch provider behavior for all tenants without control-plane rollout.

## Quality Feedback Loop

Provider quality should update from:

- connector run metrics;
- normalization completeness;
- dedupe duplication rate;
- summary usefulness;
- user feedback;
- support/admin incidents.

## Locked Decisions

1. Provider choice is policy-driven.
2. Provider quality is measured continuously.
3. Failover requires budget, policy and certification.
4. Browser sidecar, if ever used, is opt-in and isolated.
5. Provider changes are high-risk releases controlled by feature flags.

