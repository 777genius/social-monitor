# 348 - Rumble/Odysee Video Options 2026

## Last Verified

2026-06-04.

## Sources

- Odysee/Lighthouse API documentation mirror: https://github-wiki-see.page/m/V4NT-ORG/LibreOdysee/wiki/Odysee-API-Documentation-%E2%80%90-lighthouse.odysee.tv
- SearXNG Odysee engine notes: https://docs.searxng.org/_modules/searx/engines/odysee.html
- Rumble third-party video API example: https://docs.scrapecreators.com/v1/rumble/video
- Public Rumble search reliability discussion: https://www.reddit.com/r/RumbleForum/comments/15sgd78/rumble_search_for_video/
- Public Odysee search reliability discussion: https://www.reddit.com/r/OdyseeForever/comments/1d9luo4/problem_with_searching_videos/

## Current Reality

Rumble and Odysee are video/community platforms, but they are not as cleanly accessible as YouTube Data API for production social listening.

Odysee has discoverable search endpoints used by community tooling. Rumble has limited public developer surface and many practical integrations appear through third-party data/scraping providers.

## Odysee Option A - Lighthouse/Search Endpoint

Pros:

- usable for video/channel discovery
- simple enough for a source adapter
- good for topic-level candidate collection

Cons:

- not a full official enterprise API contract
- search quality can be uneven
- comments/engagement/full metadata need separate validation

Use for:

- experimental source adapter
- video title/description discovery

## Rumble Option B - Official/Documented Partner Path

Pros:

- preferable if a stable official developer path is available
- lower risk than scraping

Cons:

- public documentation/coverage appears less mature than YouTube
- search/channel monitoring capabilities need direct verification

Use for:

- later validation, not MVP core

## Rumble Option C - Third-Party Data Provider

Pros:

- faster to integrate than building fragile collectors
- can expose normalized video metadata endpoints

Cons:

- provider terms and data provenance must be reviewed
- may depend on scraping behind the scenes
- comments/search completeness uncertain

Use for:

- vendor adapter only

## Option D - Page Scraping

Decision:

```text
rejected_not_production_safe for core product
```

## Recommended Path

```text
YouTube first; Odysee experimental; Rumble vendor/partner only
```

## Architecture Rule

Alternative video platforms should share the `VideoSourceProviderPort`, but each provider must declare whether it supports search, channel monitoring, comments, transcripts and backfill.

