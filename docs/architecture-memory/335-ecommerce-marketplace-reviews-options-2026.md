# 335 - Ecommerce Marketplace Reviews Options 2026

## Last Verified

2026-06-04.

## Sources

- Amazon Selling Partner API Customer Feedback: https://developer-docs.amazon.com/sp-api/docs/customer-feedback-api
- Amazon Product Advertising API overview: https://affiliate-program.amazon.com/gp/advertising/api/detail/main.html
- Amazon Ads API policies: https://advertising.amazon.com/resources/ad-policy/api
- Trustpilot API help: https://trustpilot.zendesk.com/hc/en-us/articles/207309867-How-to-use-Trustpilot-APIs

## Current Reality

Ecommerce review monitoring is valuable but source-specific and heavily permissioned.

Amazon's official paths are seller/vendor/affiliate/ads oriented, not a general public review scraping API.

## Option A - Amazon SP-API Customer Feedback

Pros:

- official seller/vendor path
- review/return insight topics for ASINs
- useful for owned products

Cons:

- seller/vendor authorization required
- not arbitrary competitor review feed
- API approval and role complexity
- insights may be aggregated, not raw review stream

Use for:

- tenant-owned Amazon products

## Option B - Product Advertising API

Pros:

- official affiliate/product catalog path
- product metadata/search

Cons:

- review access is limited/not reliable for raw review monitoring
- affiliate terms
- not a review intelligence API

Use for:

- product metadata only, not core review monitoring

## Option C - Trustpilot/Review Platform APIs

Pros:

- official where business has account/application
- good for owned review management

Cons:

- platform-specific
- owned/business access
- moderation/filtering behavior affects completeness

Use for:

- tenant-owned review monitoring

## Option D - Ecommerce Data Provider

Pros:

- competitor/market review coverage
- handles scraping/vendor complexity

Cons:

- expensive
- compliance/terms review
- data freshness/coverage opacity

Use behind provider adapter if ecommerce vertical is targeted.

## Option E - Marketplace Review Scraping

Pros:

- appears to provide competitor data

Cons:

- high anti-abuse risk
- terms risk
- brittle
- not enterprise-safe

Decision:

- not production path

## Recommended Path

```text
owned seller/vendor APIs first
review/ecommerce data provider for competitor intelligence
```

## Architecture Rule

Marketplace reviews are not generic social posts.

Treat them as commerce data with platform-specific rights.
