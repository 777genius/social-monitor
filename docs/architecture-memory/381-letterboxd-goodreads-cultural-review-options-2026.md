# 381 - Letterboxd/Goodreads Cultural Review Options 2026

## Last Verified

2026-06-04.

## Sources

- Letterboxd API docs: https://api-docs.letterboxd.com/
- Letterboxd API access note: https://letterboxd.com/api-beta/
- Letterboxd support - API/beta access: https://support.letterboxd.com/hc/en-us/articles/15269070369551-Do-you-have-mobile-apps-or-an-API
- Letterboxd public visibility note: https://letterboxd.zendesk.com/hc/en-us/articles/15179129417487-Are-my-profile-reviews-and-lists-publicly-visible
- Goodreads API status overview: https://rollout.com/integration-guides/goodreads/api-essentials
- Goodreads public API maintenance discussion: https://www.goodreads.com/topic/show/18536888-is-the-public-api-maintained-at-all
- Goodreads review-bombing platform context: https://en.wikipedia.org/wiki/Goodreads

## Current Reality

Cultural review platforms can be useful for entertainment/media monitoring, but API access varies sharply.

Letterboxd has API documentation and request/beta access. Goodreads public API support is effectively not a strong current production path.

## Letterboxd Option A - Official/Beta API

Pros:

- official API documentation exists
- strong for film reviews, lists, ratings and cultural sentiment
- public profiles/reviews/lists are visible unless private/search-hidden

Cons:

- API access is by request/beta
- moderation and high-volume traffic states may hide reviews
- not MVP unless entertainment customers are targeted

Use for:

- film/media industry monitoring

## Letterboxd Option B - TMDb for Metadata + Letterboxd for Social Signal

Pros:

- separates film metadata from user social signal
- TMDb is the correct source for film entity enrichment

Cons:

- TMDb does not provide Letterboxd reviews
- licensing and attribution must be tracked separately

Use for:

- enrichment architecture

## Goodreads Option C - Official API

Decision:

```text
deferred
```

Reason:

- public API appears unsupported/not actively maintained
- docs and access are unreliable for new production integrations

## Goodreads Option D - Vendor/Extractor

Pros:

- can provide book reviews/ratings where direct access is absent

Cons:

- provenance and terms risk
- review scraping can be fragile
- not suitable for generic SaaS source claims

Use for:

- `vendor_adapter_only`

## Recommended Path

```text
Letterboxd via official/beta API if entertainment vertical needs it; Goodreads vendor/research only
```

## Architecture Rule

Cultural review sources need entity enrichment separation: `ReviewItem` references `FilmEntity`, `BookEntity` or `MediaEntity`, but metadata providers are not review sources.

