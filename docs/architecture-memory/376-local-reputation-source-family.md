# 376 - Local Reputation Source Family

## Purpose

Local reputation sources require a different model from post-based social networks.

Examples:

- Google Business Profile
- Yelp
- Nextdoor
- Facebook local pages
- Trustpilot
- TripAdvisor-like review sources
- local forums and city/community boards

## Core Difference

Social post:

```text
author says something about topic
```

Review/local reputation item:

```text
reviewer/customer/local user evaluates a business/location/service
```

## Required Domain Fields

```text
business_id
business_name
location_id
geo
rating
rating_scale
review_text
review_url
reviewer_identity_quality
verification_level
source_moderation_state
review_date
response_status
owner_response
```

## Source Acquisition Rule

Prefer:

- official owned-business APIs
- official local/search APIs
- authorized review exports
- provider/vendor integrations with data rights

Avoid:

- broad review scraping
- hidden/private local feeds
- unsupported automation

## Product Implication

Local reputation can become a separate paid module:

```text
review monitoring -> sentiment/reason extraction -> owner response drafting -> trend digest
```

It should not slow down the first MVP social mention monitor unless the target users are local businesses.

## Architecture Rule

Local reputation must be its own bounded context or source family, not a special case inside generic social posts.

