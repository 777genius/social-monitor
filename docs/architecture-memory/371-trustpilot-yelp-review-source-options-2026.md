# 371 - Trustpilot/Yelp Review Source Options 2026

## Last Verified

2026-06-04.

## Sources

- Trustpilot developer docs: https://developers.trustpilot.com/
- Trustpilot Consumer API: https://developers.trustpilot.com/consumer-api
- Trustpilot API help center: https://trustpilot.zendesk.com/hc/en-us/articles/207309867-How-to-use-Trustpilot-APIs
- Yelp Fusion API overview: https://docs.developer.yelp.com/docs/fusion-intro
- Yelp business search endpoint: https://docs.developer.yelp.com/reference/v3_business_search
- Yelp review endpoint context: https://docs.developer.yelp.com/docs/fusion-intro
- Public 2026 Trustpilot/Yelp review-quality complaints: Reddit search results reviewed 2026-06-04.

## Current Reality

Review platforms are not social networks, but they are high-value reputation sources.

They should be modeled as `ReviewSourceProviderPort`, not as generic social feeds. Reviews have ratings, verification states, business/location identity, moderation status and fraud/quality concerns.

## Trustpilot Option A - Official Trustpilot APIs

Pros:

- official API documentation exists
- supports business integrations, webhooks and review data use cases
- better production posture than scraping

Cons:

- access may depend on Trustpilot business relationship and API permissions
- public/business review retrieval scope must be verified per endpoint
- review moderation/verification state can affect what appears

Use for:

- owned business reputation monitoring
- verified review workflows
- customer-support/reputation dashboards

## Trustpilot Option B - Third-Party Review Data Provider

Pros:

- can expose public business review pages as structured JSON
- faster to test than business onboarding

Cons:

- provenance and terms must be reviewed
- may rely on page extraction
- less reliable for production claims

Use for:

- `vendor_adapter_only`

## Yelp Option C - Yelp Fusion API

Pros:

- official business search and local data API
- review excerpts endpoint exists
- strong for local business discovery/context

Cons:

- review endpoint exposes only limited excerpts, not full review corpus
- not sufficient for complete review monitoring
- rate limits and local market coverage must be respected

Use for:

- local business context
- limited reputation snippets

## Yelp Option D - Scraping Full Reviews

Decision:

```text
rejected_not_production_safe
```

Reason:

- official API exposes limited review data
- broad full-review scraping is a legal/operational risk

## Recommended Path

```text
Trustpilot official API for owned/authorized business use; Yelp Fusion for limited local context; vendors only after rights review
```

## Architecture Rule

Review sources need separate fields:

```text
rating, rating_scale, reviewer_display_name, verification_level,
business_id, location_id, moderation_status, review_url, review_date
```

