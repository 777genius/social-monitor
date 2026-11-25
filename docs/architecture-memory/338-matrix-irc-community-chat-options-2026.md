# 338 - Matrix/IRC Community Chat Options 2026

## Last Verified

2026-06-04.

## Sources

- Matrix Client-Server API: https://spec.matrix.org/latest/client-server-api/
- Matrix sync API: https://spec.matrix.org/latest/client-server-api/#syncing
- IRCv3 specifications: https://ircv3.net/irc/
- IRCv3 message tags: https://ircv3.net/specs/extensions/message-tags
- IRCv3 registry: https://ircv3.net/registry

## Current Reality

Matrix and IRC are open/community chat systems. They are valuable for open-source/dev communities but require explicit room/channel participation and strong etiquette.

They are not broad consumer social networks.

## Matrix Option A - Bot/User Client With `/sync`

Pros:

- official Matrix Client-Server API
- sync token supports incremental updates
- room/event model is structured
- useful for tenant-authorized rooms

Cons:

- room membership/permissions required
- encrypted rooms need special handling
- homeserver differences
- message retention/redaction semantics

Use for:

- authorized community rooms
- open-source project rooms

## Matrix Option B - Application Service / Bridge

Pros:

- better for managed multi-room integrations
- can bridge/namespace users/rooms

Cons:

- more complex
- homeserver admin cooperation
- not MVP-friendly

Use later for enterprise/community hosting.

## IRC Option A - Bot In Channel

Pros:

- simple protocol
- useful for public/open project channels
- low overhead

Cons:

- no universal history
- network/channel etiquette
- nickname/auth complexity
- fragmented modern capabilities

Use for:

- known open IRC communities with permission

## IRC Option B - IRCv3 Capabilities

Pros:

- message tags, SASL, chathistory where supported
- better metadata than legacy IRC

Cons:

- network support varies
- history not guaranteed

Use only with capability detection.

## Recommended Path

```text
tenant-authorized Matrix rooms first
specific IRC channels only with explicit low-volume policy
```

## Architecture Rule

Community chat monitoring requires membership/permission and etiquette.

Do not treat it as public web crawling.
