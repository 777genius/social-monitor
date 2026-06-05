# 312 - Bluesky/Mastodon/Fediverse Options 2026

## Last Verified

2026-06-04.

## Sources

- Bluesky firehose: https://docs.bsky.app/docs/advanced-guides/firehose
- Bluesky searchPosts: https://docs.bsky.app/docs/api/app-bsky-feed-search-posts
- Mastodon rate limits: https://docs.joinmastodon.org/api/rate-limits/
- Mastodon streaming API: https://docs.joinmastodon.org/methods/streaming/
- ActivityPub W3C recommendation: https://www.w3.org/TR/activitypub/

## Current Reality

Bluesky and the fediverse are more developer-accessible than many centralized networks.

They still require careful handling of federation, deletion, moderation, instance policy and data volume.

## Bluesky Option A - Public Search API

Pros:

- official endpoint
- public API host exists for some endpoints
- good for keyword discovery

Cons:

- search behavior/limits can change
- not complete historical truth
- API availability/rate behavior needs monitoring

Use for:

- topic candidate discovery

## Bluesky Option B - AT Protocol Firehose

Pros:

- real-time stream primitive
- strong for broad monitoring
- open protocol orientation

Cons:

- high volume
- requires indexing/filtering pipeline
- replay/backfill complexity
- moderation/deletion handling needed

Use later for:

- real-time paid tier or broad public monitoring

## Mastodon Option A - Instance REST/Search/Timelines

Pros:

- official Mastodon API
- rate-limit headers documented
- good for known instances/tags/accounts

Cons:

- instance-specific
- no single global truth
- per-instance rate/policy differences

Use for:

- known instance monitoring
- user-selected Mastodon instances/tags

## Mastodon Option B - Streaming API

Pros:

- realtime public/local/user streams where supported
- good for selected instance monitoring

Cons:

- federation fragmentation
- not all public content across fediverse
- connection management per instance

Use with:

- instance registry
- per-instance budgets

## Fediverse Option C - ActivityPub Inbox/Relay

Pros:

- protocol-native
- can receive federated activities if operating an actor/service

Cons:

- significant protocol complexity
- moderation/deletion/security responsibilities
- not needed for MVP

Use only for:

- mature fediverse integration

## Recommended Path

Near-term:

```text
Bluesky searchPosts + Mastodon selected instances
```

Later:

```text
Bluesky firehose + fediverse instance registry
```

## Architecture Rule

Open protocols reduce platform lock-in, but they move complexity into indexing, federation policy and moderation.
