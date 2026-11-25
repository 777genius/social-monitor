# 318 - Slack Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Slack Events API: https://docs.slack.dev/apis/events-api/
- Slack rate limits: https://api.slack.com/docs/rate-limits
- Slack conversations.history: https://api.slack.com/methods/conversations.history
- Slack app scopes: https://api.slack.com/scopes

## Current Reality

Slack is a tenant-authorized workspace integration, not a public social network.

Slack changed rate limits for some non-Marketplace apps starting in 2025 for `conversations.history` and `conversations.replies`, so history polling must be treated as constrained.

## Option A - Events API

Pros:

- official push model
- workspace-authorized
- good for mentions/app channels
- avoids polling

Cons:

- event delivery rate limits
- scope configuration
- app installation flow
- only authorized workspaces/channels

Use for:

- tenant workspace alerts and internal community monitoring

## Option B - conversations.history / replies

Pros:

- official
- useful for bounded history sync
- can hydrate threads

Cons:

- rate-limit changes
- scope-sensitive
- not for broad continuous scraping

Use for:

- backfill after install
- explicit channel sync with caps

## Option C - Slack Search API

Pros:

- can help authorized workspace search where available

Cons:

- permission and plan limitations
- rate limits
- not public data

Use sparingly.

## Option D - Workspace/User Token Scraping

Pros:

- may appear to access more data

Cons:

- security/privacy risk
- terms/compliance risk
- not suitable for SaaS

Decision:

- not production path

## Recommended Path

```text
Slack app install -> Events API for new events -> bounded history sync for selected channels
```

## Architecture Rule

Slack data is customer workspace data.

Treat it with stronger privacy controls than public web content.
