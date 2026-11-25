# 383 - Rating/Review Source Family Expansion

## Purpose

Many valuable "social" signals are ratings/reviews rather than posts.

Examples:

- app store reviews
- ecommerce reviews
- Trustpilot/Yelp/Google reviews
- Glassdoor/Indeed employer reviews
- Tripadvisor/Booking hospitality reviews
- Steam app reviews
- Letterboxd/Goodreads cultural reviews

## Why This Must Be Separate

Generic post model:

```text
text + author + source + timestamp
```

Review model:

```text
entity + rating + review text + verification/moderation state + source-specific visibility rules
```

If these are mixed too early, summary quality and source governance become poor.

## Common Fields

```text
review_id
source_platform
reviewed_entity_id
reviewed_entity_type
rating
rating_scale
review_text
review_title
reviewer_display_name
reviewer_status
verification_level
moderation_status
review_date
updated_at
source_url
owner_response
helpfulness_votes
language
country_or_market
```

## Source-Specific Edge Cases

- reviews can disappear after moderation
- ratings can be recalculated with hidden rules
- review bombing can distort summaries
- verified/unverified status changes meaning
- owner responses are part of reputation workflow
- APIs may expose excerpts instead of full text
- historical backfill may be unavailable

## Product Modules

Potential modules:

- reputation monitoring
- review digest
- complaint reason extraction
- owner response drafting
- review bombing detection
- rating trend alerts
- competitor review comparison

## Architecture Rule

Rating/review sources should be a first-class source family with dedicated normalization, not an afterthought in social post ingestion.

