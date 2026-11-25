# 351 - Tumblr Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Tumblr API v2 docs: https://www.tumblr.com/docs/en/api/v2
- Tumblr public docs repository: https://github.com/tumblr/docs
- Tumblr tagged method docs: https://www.tumblr.com/docs/en/api/v2#tagged-method
- Tumblr NPF docs: https://www.tumblr.com/docs/npf
- Tumblr platform context: https://en.wikipedia.org/wiki/Tumblr

## Current Reality

Tumblr is a practical long-tail social source because it still exposes official API methods for public tagged posts and blog posts.

It is not a first MVP source unless the target topics require fandom, art, culture, lifestyle or visual/blog communities, but it is much cleaner than many closed platforms.

## Option A - Official Tagged API

Pros:

- official endpoint for tag-based discovery
- API key or OAuth access
- maps naturally to topic keywords/tags
- supports pagination by timestamp-like cursor

Cons:

- tag search is not full global semantic search
- result limits and 429 rate limits must be respected
- content format varies between legacy and NPF

Use for:

- topic tag monitoring
- fandom/lifestyle/culture signals

## Option B - Official Blog Posts API

Pros:

- good for known blog/watchlist monitoring
- stable URL/blog identity
- useful for backfill from selected sources

Cons:

- requires blog identifiers
- not broad discovery by itself
- private/limited content requires authorization

Use for:

- source watchlists
- creator/blog monitoring

## Option C - RSS/Open Web

Pros:

- simple fallback for some blogs
- low implementation cost
- works with open-web ingestion pipeline

Cons:

- inconsistent feed availability
- less metadata than API
- may miss platform-native interactions

Use for:

- low-volume fallback

## Option D - Browser Scraping

Decision:

```text
rejected_not_production_safe
```

Reason:

- official API exists
- scraping adds fragility without enough product gain

## Recommended Path

```text
early_saas_approved for tag/blog monitoring after Reddit/HN/RSS core
```

## Architecture Rule

Tumblr should use the generic `TagSearchSourceProviderPort` plus a Tumblr-specific NPF normalizer.

