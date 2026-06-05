# 339 - Twitch Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Twitch API guide: https://dev.twitch.tv/docs/api/guide
- Twitch EventSub: https://dev.twitch.tv/docs/eventsub/
- Twitch EventSub reference: https://dev.twitch.tv/docs/eventsub/eventsub-reference/
- Twitch chat/IRC docs: https://dev.twitch.tv/docs/irc

## Current Reality

Twitch is useful for creator/streaming/community monitoring, but it is channel-centric.

Official APIs support users, streams, videos, clips and events. Chat monitoring is possible through EventSub/IRC with authentication and channel context.

## Option A - Twitch Helix API

Pros:

- official
- streams/videos/clips/users/search metadata
- documented rate limits
- good for channel/watchlist monitoring

Cons:

- not full chat history
- rate limits
- requires OAuth/app tokens

Use for:

- channel live status
- clips/videos discovery
- creator watchlists

## Option B - EventSub

Pros:

- official event delivery
- webhook or WebSocket transports
- chat message events and channel events where authorized
- duplicate message id behavior documented for retries

Cons:

- subscription setup/authorization
- event type versions change
- not broad platform-wide firehose

Use for:

- tenant-owned or authorized channels
- realtime channel event monitoring

## Option C - Twitch IRC Chat

Pros:

- official chat docs
- can monitor live chat for joined channels
- mature bot ecosystem

Cons:

- live-only unless history available elsewhere
- chat can be extremely high volume
- moderation/deleted message handling
- channel permissions/modes affect visibility

Use only with:

- channel authorization
- rate and volume caps

## Option D - VOD Chat/Unofficial Scraping

Pros:

- historical chat would be valuable

Cons:

- official support limited
- brittle/unreliable
- policy risk

Decision:

- not production default

## Recommended Path

```text
Helix channel metadata + EventSub for authorized channels
```

Chat ingestion is paid/opt-in with strict caps.

## Architecture Rule

Twitch is realtime channel monitoring, not general social search.
