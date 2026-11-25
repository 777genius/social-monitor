# 329 - Vendor Coverage Claims Comparison 2026

## Last Verified

2026-06-04.

## Sources

- Keyhole listening platform coverage: https://help.keyhole.co/en/articles/10594482-social-listening-platforms-tracked-by-keyhole
- Mentionlytics supported data sources: https://intercom.help/mentionlytics/en/articles/3705684-what-data-sources-are-supported-in-mentionlytics
- Mention source explanation: https://support.mention.com/en/articles/13420818-mention-sources-explained
- Hootsuite integrations: https://www.hootsuite.com/platform/integrations
- Brandwatch sources: https://social-media-management-help.brandwatch.com/hc/en-us/articles/4556945084701-Sources-for-Listen-Mentions
- Sprout source limitations: https://support.sproutsocial.com/hc/en-us/articles/360056024132-Social-Listening-data-availability-and-limitations

## Current Reality

Vendor pages consistently show the same split:

- broad claims include social, web, blogs, forums, news, reviews, podcasts
- closed platforms require authentication, connected profiles or partner data
- Reddit/X full coverage is mostly enterprise/partner territory
- Facebook/Instagram/LinkedIn/TikTok often have owned-profile limitations
- YouTube is usually channel/search/comment constrained

## Architectural Implication

Do not model "supported source" as boolean.

Model:

```text
source
acquisition_mode
coverage_scope
auth_required
backfill_window
comments_supported
search_supported
owned_profile_only
provider_cost
terms_review_status
```

## Vendor Claim Risk

When a vendor says "supports TikTok" or "supports Instagram", it may mean:

- owned profile analytics
- comments on owned posts
- hashtag search
- sampled mentions
- public posts only
- connected business account required
- vendor-owned data library

These are not equivalent.

## Due Diligence Questions

Ask every data provider:

- Is data official API, partner/firehose, crawler or reseller?
- Is source coverage complete, sampled or scoped?
- What historical backfill is available?
- Can data be exported and stored?
- Are comments/replies included?
- Are deleted/edited items updated?
- What terms restrict AI summarization?
- What happens if platform API terms change?

## Recommended Product Behavior

Tenant UI should show:

- source type
- coverage limits
- connected/owned requirement
- backfill window
- scan frequency
- cost/budget tier

## Architecture Rule

"Supports platform X" is not enough.

Coverage semantics are part of the connector contract.
