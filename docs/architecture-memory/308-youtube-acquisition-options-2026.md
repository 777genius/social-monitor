# 308 - YouTube Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- YouTube Data API search.list: https://developers.google.com/youtube/v3/docs/search/list
- YouTube Data API quota calculator: https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube commentThreads.list: https://developers.google.com/youtube/v3/docs/commentThreads/list
- YouTube videos.list: https://developers.google.com/youtube/v3/docs/videos/list

## Current Reality

YouTube is feasible through official Data API, but search is quota-expensive and API search behavior may not perfectly match user-visible search.

## Option A - YouTube Data API Search

Pros:

- official
- keyword search
- filters for channel, dates, type, region/language
- pagination

Cons:

- quota cost
- search ranking/coverage opaque
- default quota budget can be consumed quickly
- not full social firehose

Use for:

- targeted keyword/video discovery with strict quotas

## Option B - Channel Monitoring

Pros:

- cheaper and more predictable
- strong for known creators/channels
- supports tenant-defined watchlists

Cons:

- misses broad keyword mentions
- requires channel discovery

Use early if YouTube is added.

## Option C - Comments Monitoring

Pros:

- useful for owned-channel/community analysis
- official comment thread endpoints

Cons:

- quota and pagination cost
- moderation/private/disabled comments
- high volume on popular videos

Use with:

- bounded comment depth
- tenant-owned channel priority

## Option D - Captions/Transcripts

Pros:

- valuable for video content summaries

Cons:

- official caption access can be restricted
- third-party transcript libraries may be unofficial and brittle
- copyright/terms review needed

Use only after policy review.

## Option E - Scraping YouTube Pages

Pros:

- may access public UI data

Cons:

- unnecessary for core monitoring while API exists
- anti-abuse/breakage risk
- terms risk

Decision:

- not production path

## Recommended Path

If YouTube enters roadmap:

```text
channel monitoring first -> targeted search second -> comments only with caps
```

## Architecture Rule

YouTube quota is a product budget.

Search every topic broadly only if the tenant pays for it.
