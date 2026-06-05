# 336 - Source Option Decision Template

## Purpose

Use this template whenever evaluating a new source/social network.

It prevents vague "we support X" decisions and forces explicit acquisition, cost, risk and coverage analysis.

## Template

```text
source_name:
last_verified_at:
official_docs:
competitor_examples:

acquisition_options:
  - mode:
    description:
    pros:
    cons:
    auth_required:
    owned_profile_only:
    public_search:
    comments_supported:
    media_supported:
    backfill_window:
    rate_limit_model:
    expected_cost:
    legal_terms_status:
    ai_summary_allowed:
    recommended_for:

recommended_path:
defer_reason:
fallbacks:
kill_switch:
```

## Required Questions

1. Is there an official API?
2. Does it support public listening or only owned accounts?
3. Are comments/replies included?
4. Is search supported?
5. Is historical backfill supported?
6. Are rate limits documented?
7. Does the provider allow commercial use?
8. Does it allow storage/export?
9. Does it allow AI summarization?
10. What is the tenant-visible limitation?
11. What is the fallback if access is removed?
12. What is the expected cost per tenant/month?

## Decision Outcomes

Allowed outcomes:

- `mvp_approved`
- `early_saas_approved`
- `enterprise_only`
- `vendor_adapter_only`
- `owned_account_only`
- `research_only`
- `deferred`
- `rejected_not_production_safe`

## Production Gate

No source ships until it has:

- source option doc
- provider capability profile
- policy/terms review
- budget profile
- connector tests
- tenant-visible limitations
- kill switch

## Architecture Rule

Every source is a product contract, not just an HTTP client.
