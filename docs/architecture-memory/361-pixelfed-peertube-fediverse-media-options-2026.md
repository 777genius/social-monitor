# 361 - Pixelfed/PeerTube Fediverse Media Options 2026

## Last Verified

2026-06-04.

## Sources

- Pixelfed ActivityPub docs: https://pixelfed.github.io/docs-next/spec/ActivityPub.html
- Pixelfed project page: https://pixelfed.org/
- PeerTube REST API reference: https://docs.joinpeertube.org/api-rest-reference
- PeerTube REST quick start: https://docs.joinpeertube.org/api/rest-getting-started
- PeerTube search docs: https://docs.joinpeertube.org/use/search
- PeerTube search/index community context: https://www.reddit.com/r/PeerTube/comments/1s0ttvy/i_made_a_search_engine_for_peertube_videos/

## Current Reality

Pixelfed and PeerTube extend the fediverse into image and video communities.

They are attractive because they use open protocols/APIs, but federation means there is no single complete platform index.

## Pixelfed Option A - ActivityPub/Federated Monitoring

Pros:

- protocol-native
- can interoperate with Mastodon/fediverse infrastructure
- useful for image-centric public posts

Cons:

- instance coverage and discovery are fragmented
- media processing and rights must be handled carefully
- no single global search guarantee

Use for:

- selected instance/account monitoring
- visual fediverse research

## PeerTube Option B - Instance REST API

Pros:

- official REST API
- supports videos/channels/accounts on a selected instance
- fits video source normalization

Cons:

- one instance is incomplete
- remote object discovery depends on federation/search configuration
- video metadata/transcripts/comments vary

Use for:

- selected PeerTube instances
- channel/watchlist monitoring

## PeerTube Option C - Federated Search Index

Pros:

- better discovery across instances
- useful for topic search
- can be modeled as provider adapter

Cons:

- index completeness and freshness vary
- provenance must show which index supplied the result
- duplicate/canonical URL handling required

Use for:

- experimental topic discovery

## Recommended Path

```text
fediverse media optional; implement after generic fediverse provenance model
```

## Architecture Rule

Pixelfed and PeerTube should not create separate domain models. They should reuse `VisualSourceProviderPort`, `VideoSourceProviderPort` and `ProtocolStreamProviderPort`.

