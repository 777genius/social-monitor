# 387 - Patreon/Ko-fi Creator Platform Options 2026

## Last Verified

2026-06-04.

## Sources

- Patreon API help: https://support.patreon.com/hc/en-us/articles/206525646-Patreon-API
- Patreon API currency update: https://support.patreon.com/hc/en-us/articles/360047287991-Currency-updates-to-the-Patreon-API
- Patreon posting docs: https://support.patreon.com/hc/en-gb/articles/115004048046-Posting-to-your-Patreon
- Ko-fi API/webhook help: https://help.ko-fi.com/hc/en-us/articles/360004162298-Does-Ko-fi-Have-an-API-or-Webhook
- Ko-fi.tools unofficial/third-party tooling: https://ko-fi.tools/
- Buy Me a Coffee connector context: https://learn.microsoft.com/en-us/connectors/buymeacoffeeip/

## Current Reality

Creator monetization platforms are mostly owned/authorized creator sources, not broad public social listening sources.

They are useful for creator/customer intelligence, supporter events, public creator posts and membership/community updates. Private paid content must not be ingested unless the tenant owns/authorizes the creator account and the terms allow it.

## Patreon Option A - Official API

Pros:

- API documentation exists
- useful for campaigns, memberships, patrons and creator-owned data
- supports creator operations and integration workflows

Cons:

- Patreon no longer provides developer support for API usage
- private/member-only content requires authorization and strict boundaries
- public social discovery is not the main API purpose

Use for:

- tenant-owned creator account monitoring
- membership/supporter analytics

## Patreon Option B - Public Creator Post Watchlist

Pros:

- public posts can be monitored as open-web/creator updates where allowed
- useful for creator/influencer intelligence

Cons:

- paid/private posts are excluded unless authorized
- content visibility can change

Use for:

- public creator update monitoring

## Ko-fi Option C - Webhooks/API

Pros:

- official webhook support for payment/supporter events
- useful for owned creator workflows

Cons:

- payment event API, not public social monitoring
- not suitable for broad scanning

Use for:

- owned creator/customer event ingestion

## Buy Me a Coffee Option D - Connector/Owned Account API

Pros:

- connector ecosystem exists
- useful for supporter/donation workflows

Cons:

- owned-account use case
- not a public source

Use for:

- owned creator integrations

## Recommended Path

```text
owned_channel_only; add after core source ingestion if creator vertical matters
```

## Architecture Rule

Creator monetization platforms belong to `CreatorPlatformProviderPort` with explicit visibility tier: public, free-member, paid-member, owner-only.

