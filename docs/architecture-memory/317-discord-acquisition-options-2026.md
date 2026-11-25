# 317 - Discord Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Discord Gateway docs: https://docs.discord.com/developers/topics/gateway
- Discord Gateway events: https://docs.discord.com/developers/events/gateway-events
- Discord Message Content intent FAQ: https://support-dev.discord.com/hc/en-us/articles/4404772028055
- Discord intents docs: https://discord.com/developers/docs/topics/gateway#gateway-intents

## Current Reality

Discord monitoring is only appropriate for servers where the tenant installs/authorizes the bot.

Message content access is controlled by privileged intents and permissions.

## Option A - Discord Bot Gateway Events

Pros:

- official
- real-time events
- good for tenant-owned/community servers
- supports channel/member/message event patterns

Cons:

- requires bot installation
- gateway connection management
- intents/permissions complexity
- message content is privileged/limited

Use for:

- tenant-authorized server monitoring

## Option B - REST API Hydration

Pros:

- official
- fetches channel/messages where authorized
- useful for backfill/repair

Cons:

- rate limits
- permission-bound
- not broad public discovery

Use for:

- bounded history sync after bot install

## Option C - Public Invite/Server Scraping

Pros:

- may expose partial public info

Cons:

- not official monitoring
- privacy/terms risk
- message access usually not available
- brittle

Decision:

- not production path

## Recommended Path

```text
tenant installs bot -> gateway events -> inbox/idempotency -> message normalization
```

## Architecture Rule

Discord is an authorized-community integration, not a public social listening source.
