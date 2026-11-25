# 356 - Long-Tail Source Expansion Playbook

## Purpose

This playbook explains how to add new social/community sources without turning the product into a fragile scraper collection.

## Current Long-Tail Source Families

```text
tag/blog communities: Tumblr, Medium, Substack
reddit-like federated communities: Lemmy, Mbin
visual UGC: Flickr, Pinterest
video: YouTube, Twitch, Rumble, Odysee
events/community intent: Meetup, Eventbrite, Product Hunt
protocol social: Bluesky, Mastodon, Nostr, Farcaster
regional social: WeChat, Weibo, VK
search demand: Google Trends, SERP providers
```

## Expansion Criteria

A source can enter roadmap only if it has at least one of:

- official API
- public feed/RSS/export
- protocol-native stream or sync
- licensed vendor data path
- tenant-owned account authorization

If none exists, the source stays `research_only` or `rejected_not_production_safe`.

## Required Connector Capabilities

Every new source must declare:

- `supports_search`
- `supports_watchlist`
- `supports_comments`
- `supports_reactions`
- `supports_media`
- `supports_backfill`
- `supports_realtime`
- `requires_tenant_auth`
- `owned_account_only`
- `public_listening_allowed`
- `data_retention_allowed`
- `ai_summary_allowed`

## Product Rule

User-facing source claims must be precise.

Bad:

```text
We monitor Tumblr.
```

Better:

```text
We monitor public Tumblr tagged posts and configured blogs through the official Tumblr API, subject to rate limits and content availability.
```

## Architecture Rule

Add source families before individual providers:

```text
PostSourceProviderPort
CommentSourceProviderPort
TagSearchSourceProviderPort
VisualSourceProviderPort
VideoSourceProviderPort
EventSourceProviderPort
ExternalSignalProviderPort
ProtocolStreamProviderPort
VendorDatasetProviderPort
```

This prevents provider-specific models from leaking into domain use cases.

