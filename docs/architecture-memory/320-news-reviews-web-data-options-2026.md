# 320 - News/Reviews/Web Data Options 2026

## Last Verified

2026-06-04.

## Sources

- GDELT Cloud API docs: https://docs.gdeltcloud.com/api-reference
- Common Crawl: https://commoncrawl.org/
- Common Crawl CDXJ index: https://commoncrawl.org/cdxj-index
- Trustpilot API help: https://trustpilot.zendesk.com/hc/en-us/articles/207309867-How-to-use-Trustpilot-APIs

## Current Reality

Social listening competitors often monitor beyond social networks: news, blogs, review sites, forums and podcasts.

For us, this should be a separate source class from social APIs.

## Option A - News/Data APIs

Examples:

- GDELT
- news API providers
- media monitoring vendors

Pros:

- broad news/blog coverage
- search-oriented
- often cheaper than building crawler

Cons:

- coverage/ranking opaque
- licensing/redistribution terms
- source freshness varies

Use for:

- brand/news mention monitoring

## Option B - Common Crawl

Pros:

- free open crawl corpus
- massive historical web data
- useful for research/backfill

Cons:

- not real-time
- huge data engineering overhead
- needs heavy filtering and compliance review

Use for:

- offline research, not realtime monitoring

## Option C - Review Platform APIs

Examples:

- Trustpilot Business APIs where business has access
- app store review APIs where official
- G2/Capterra/vendor APIs if available

Pros:

- official for owned/relevant review data
- high business signal

Cons:

- platform-specific access
- business account requirements
- review moderation/availability caveats

Use for:

- tenant-owned review monitoring

## Option D - Managed Web/Review Provider

Pros:

- broad coverage fast
- source normalization included

Cons:

- vendor lock-in
- pricing
- opaque source rights

Use behind adapter.

## Option E - Custom Crawler

Pros:

- control
- can target long-tail sources

Cons:

- robots/terms/politeness complexity
- high ops cost
- duplicate/canonicalization hard
- not MVP-friendly

Use later only with strict scope.

## Recommended Path

```text
RSS/Atom + targeted official review APIs + optional GDELT/news provider
```

## Architecture Rule

News/review/web data is adjacent intelligence, not the same as social network scanning.
