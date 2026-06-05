# 378 - Glassdoor/Indeed Employer Review Options 2026

## Last Verified

2026-06-04.

## Sources

- Glassdoor 2026 API-access market analysis: https://clura.ai/blog/glassdoor-api
- Glassdoor source limitations from Curator: https://help.curator.io/adding-glassdoor-source-00ab2
- Glassdoor legal/profile alert documentation: https://help.glassdoor.com/s/article/Glassdoor-Legal-Action-Profile-Banner-Alerts
- Indeed company review guidelines: https://support.indeed.com/hc/en-au/articles/360046789111
- Indeed review submission/moderation help: https://support.indeed.com/hc/en-gb/articles/360026912831-Adding-and-deleting-your-employer-reviews
- Employer review verification research: https://arxiv.org/abs/2511.01086

## Current Reality

Employer review sites are high-value reputation sources, but they are not open social feeds.

Glassdoor public API access is effectively not a reliable open developer path in 2026. Indeed exposes company reviews as a product surface, but not as a simple public monitoring API for arbitrary external scanning.

## Glassdoor Option A - Official/Partner Access

Pros:

- best path if a current partner contract exists
- lower risk than scraping
- review/rating data is highly valuable for employer reputation

Cons:

- public/open API access appears closed or deprecated
- existing integrations may be constrained to recent reviews
- historical/full review coverage is not guaranteed

Use for:

- enterprise employer-brand package only after direct access confirmation

## Glassdoor Option B - Vendor/Extractor API

Pros:

- can provide structured employer reviews/salaries/interviews quickly
- useful for research/prototype

Cons:

- likely page extraction or browser-session dependent
- data rights and provenance must be reviewed
- high risk for production claims

Use for:

- `vendor_adapter_only`

## Indeed Option C - Owned Employer Monitoring

Pros:

- company pages and review moderation workflows are official product surfaces
- useful for employer-brand monitoring if access is authorized

Cons:

- not a broad public review API
- review visibility/moderation can change
- verified-employee signals affect interpretation

Use for:

- owned employer reputation dashboard

## Option D - Scraping Employer Reviews

Decision:

```text
rejected_not_production_safe
```

Reason:

- fragile
- high legal/platform risk
- not reliable enough for multi-tenant SaaS

## Recommended Path

```text
defer for MVP; employer reviews are enterprise/vendor-only
```

## Architecture Rule

Employer reviews need an `EmployerReputationSourceProviderPort`, separate from generic review sources, with fields for employer id, role, employment status, verification signal, pros/cons and review moderation context.

