# Source Policy Matrix

Date: 2026-05-31
Status: baseline source policy memory

## Decision

Every source must have a legal/compliance policy entry before production use.

No source can move to GA without a completed source policy matrix row.

## Matrix Fields

```text
source_type
provider
allowed_use_cases
auth_method
terms_url
rate_limit_policy
storage_allowed
raw_payload_retention
normalized_data_retention
summary_retention
deletion_sync_required
redistribution_allowed
derived_summary_allowed
user_data_export_required
source_policy_sensitive_fields
risk_level
owner
last_reviewed_at
next_review_at
```

## Source Classes

```text
public_feed
official_api
permissioned_bot
provider_api
federated_protocol
manual_import
```

## Initial Policy Notes

HN:

- official public API;
- stable IDs;
- low compliance complexity;
- good first source.

RSS:

- source-specific copyright/terms may vary;
- raw payload retention should be short;
- canonical URL and feed metadata matter.

Reddit:

- OAuth/API-first;
- rate-limit headers must be respected;
- deletion/content compliance must be designed.

X:

- high cost/policy volatility;
- provider abstraction required;
- no realtime promise until economics and access are proven.

Telegram:

- permissioned source;
- bot/account access depends on channel/group permissions.

## Review Cadence

Review high-risk source policies at least quarterly:

```text
X
Reddit
provider APIs
browser/sidecar connectors if ever used
```

Review lower-risk sources every 6-12 months or when terms change.

## Locked Decisions

1. No GA source without source policy matrix.
2. Policy matrix must include retention/deletion/export behavior.
3. X and Reddit are high-risk and require periodic policy review.
4. Source policy drives connector behavior and retention, not the other way around.

