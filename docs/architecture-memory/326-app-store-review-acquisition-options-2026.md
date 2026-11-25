# 326 - App Store Review Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Apple App Store Connect API customer reviews: https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews
- Apple App Store Connect API apps: https://developer.apple.com/documentation/appstoreconnectapi/apps
- Google Play Developer API overview: https://developer.android.com/google/play/developer-api
- Google Play Reporting API overview: https://developer.android.com/google/play/developer-api

## Current Reality

App store reviews are high-signal owned-product feedback, not public social listening.

Official APIs are mostly for app owners/developers, not arbitrary competitor review scraping.

## Option A - Apple App Store Connect API

Pros:

- official
- customer reviews endpoints
- response management endpoints
- strong for owned iOS apps

Cons:

- requires App Store Connect access
- owned-app scope
- API auth/key management
- not broad competitor monitoring

Use for:

- tenant-owned iOS app review monitoring

## Option B - Google Play Developer/Reporting APIs

Pros:

- official
- supports Play Console/reporting workflows
- good for owned Android apps

Cons:

- owned-app access
- service account setup
- API quirks/errors possible
- not public app-store search API

Use for:

- tenant-owned Android app review monitoring

## Option C - Public Store Page Scraping

Pros:

- can show competitor reviews in browser

Cons:

- no official broad API guarantee
- brittle
- store policy risk
- localization/pagination complexity

Decision:

- not production default

## Option D - Review/App Intelligence Vendor

Pros:

- competitor app review coverage
- broad app-store intelligence
- easier analytics

Cons:

- vendor cost
- terms/rights need review
- coverage opacity

Use behind adapter if needed.

## Recommended Path

```text
owned app review APIs first
competitor app reviews only through reviewed provider
```

## Architecture Rule

App store reviews belong to owned-product feedback unless provider rights prove broader access.
