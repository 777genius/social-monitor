# 325 - Podcast Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Listen Notes API docs: https://www.listennotes.com/api/docs/
- Listen Notes quickstarts: https://www.listennotes.help/en/articles/4860027-podcast-api-quickstarts
- Spotify podcast API blog: https://developer.spotify.com/blog/2020-03-20-introducing-podcasts-api
- Spotify Web API episodes/shows docs: https://developer.spotify.com/documentation/web-api/reference/get-a-shows-episodes

## Current Reality

Podcasts are adjacent to social listening: they are slower-moving but high-value for brand, competitor and market narrative monitoring.

The hard part is not metadata; it is transcript availability, licensing and semantic search.

## Option A - Listen Notes API

Pros:

- podcast/episode full-text search
- broad podcast directory
- official API and libraries
- good for keyword discovery

Cons:

- paid API
- transcript availability may vary
- provider dependency
- licensing/terms review needed for stored text/audio

Use for:

- podcast mention monitoring
- episode discovery

## Option B - Spotify Web API

Pros:

- official
- show/episode metadata
- search returns shows/episodes

Cons:

- Spotify catalog only
- transcript/search limitations
- app review/auth constraints

Use for:

- metadata and Spotify-specific podcast discovery

## Option C - Podcast RSS Feeds

Pros:

- open standard
- cheap
- can monitor known shows

Cons:

- no transcript by default
- metadata-only monitoring unless show notes include terms
- duplicates/moving GUIDs possible

Use for:

- known podcast watchlists

## Option D - Audio Transcription Pipeline

Pros:

- full semantic coverage when transcript absent

Cons:

- expensive
- copyright/terms risk
- storage/privacy concerns
- long processing latency

Use only for:

- tenant-approved known shows
- paid tiers with clear budget

## Recommended Path

```text
known-show RSS + Listen Notes provider for discovery
```

Transcription is later and budget-gated.

## Architecture Rule

Podcast monitoring is a media pipeline, not just another text feed.
