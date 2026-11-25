# 323 - Lobsters/Indie Hackers Options 2026

## Last Verified

2026-06-04.

## Sources

- Lobsters homepage/search/tags: https://lobste.rs/
- Lobsters tags: https://lobste.rs/tags
- Indie Hackers RSS community project: https://github.com/ahonn/ihrss
- Indie Hackers feed mirror: https://feed.indiehackers.world/
- SignalPipe RSS monitoring examples: https://signalpipe.io/monitor/rss

## Current Reality

Niche founder/developer communities are high-signal for product ideas, pain points and competitor mentions.

They often lack rich official APIs, but have RSS, public pages or community-maintained feeds.

## Option A - Lobsters Public Pages/RSS-Like Monitoring

Pros:

- public content
- strong developer signal
- tags and comments visible
- low volume

Cons:

- no broad official API guarantee
- HTML parsing may be needed
- small community and etiquette sensitivity

Use with:

- responsible fetching
- low frequency
- tag/topic filters

## Option B - Indie Hackers RSS Mirrors

Pros:

- easy RSS ingestion
- founder-specific signal
- good for product/market monitoring

Cons:

- unofficial mirror/feed
- may break/disappear
- coverage uncertainty

Use as:

- experimental/source profile with health checks

## Option C - Generated RSS Provider

Pros:

- faster than custom parser
- can monitor pages with no feed

Cons:

- provider dependency
- terms/robots/site policy still matter
- coverage may be brittle

Use behind adapter.

## Option D - Custom Scraping

Pros:

- can cover exact pages

Cons:

- brittle
- community etiquette risk
- not worth high engineering effort unless source is valuable

Decision:

- only low-volume, responsible, reviewed site-specific adapter if no feed/API exists

## Recommended Path

```text
RSS/feed first -> responsible public-page adapter only if needed
```

## Architecture Rule

Small communities can be high value but should be treated gently.

Low-volume responsible fetching is more appropriate than aggressive crawling.
