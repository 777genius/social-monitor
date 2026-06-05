# 379 - Tripadvisor/Booking Travel Review Options 2026

## Last Verified

2026-06-04.

## Sources

- Tripadvisor Content API overview: https://developer-tripadvisor.com/home/
- Tripadvisor API provider metadata: https://providers.apis.io/providers/tripadvisor/
- OpenPublicAPIs Tripadvisor overview: https://openpublicapis.com/api/tripadvisor
- Booking.com review API context: https://1aac6de1-6f71-45a0-891f-ea7f9e9d065e.filesusr.com/ugd/f27c19_8f1cee4439404784a9a5b50e623dbc48.pdf
- Public 2026 Booking.com review/friction discussions reviewed 2026-06-04.
- Public 2026 Tripadvisor relevance/review discussions reviewed 2026-06-04.

## Current Reality

Travel review platforms are strong local/reputation sources for hotels, restaurants, attractions and destinations.

They are not broad social listening sources. Access is partner/API/vendor-specific and review data rights matter.

## Tripadvisor Option A - Content API / Partner Access

Pros:

- official/partner-oriented data access exists
- supports locations, ratings, reviews, photos and metadata where permitted
- valuable for travel/hospitality reputation

Cons:

- access may require partner approval
- not a free/open broad review firehose
- content usage/display rules must be followed

Use for:

- travel/hospitality enterprise package

## Booking.com Option B - Partner/Property API

Pros:

- valuable for property-owned review monitoring
- can support hospitality operations

Cons:

- access is likely partner/property-contextual
- public arbitrary property review monitoring is not a simple open path
- review policy and guest eligibility can affect interpretation

Use for:

- owned property reputation workflows

## Option C - Travel Review Data Vendor

Pros:

- can aggregate multiple travel review platforms
- faster than individual partnerships

Cons:

- provenance and rights review required
- platform-specific display/storage restrictions may apply
- cost can be high

Use for:

- `vendor_adapter_only`

## Option D - Public Page Scraping

Decision:

```text
rejected_not_production_safe
```

## Recommended Path

```text
defer for MVP unless target users are hospitality/local businesses
```

## Architecture Rule

Travel reviews should reuse `LocalReputationSourceProviderPort` with travel-specific metadata: property type, destination, attraction category, stay date and owner response.

