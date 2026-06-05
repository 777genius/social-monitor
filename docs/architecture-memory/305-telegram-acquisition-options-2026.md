# 305 - Telegram Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram webhooks: https://core.telegram.org/bots/webhooks
- Telegram API terms: https://core.telegram.org/api/terms
- TDLib: https://github.com/tdlib/td

## Current Reality

Telegram is not one acquisition model.

Bot API, channel/group bot membership, business/managed bot features and full client API/TDLib have different permissions, privacy and operational risk.

## Option A - Bot API Webhooks

Pros:

- official
- production-friendly push model
- supports secret token header
- good for groups/channels where bot is added
- no polling loop

Cons:

- bot can receive only allowed update types/context
- requires tenant/admin to add bot
- not arbitrary public channel search
- webhook reliability/inbox needed

Use for:

- tenant-owned or tenant-authorized channel/group monitoring

## Option B - Bot API getUpdates Long Polling

Pros:

- official
- simple local/dev setup
- no public webhook URL needed

Cons:

- mutually exclusive with webhook
- less ideal for production
- update retention limited
- offset mistakes cause duplicate/missed updates

Use for:

- local development
- controlled fallback

## Option C - Local Bot API Server

Pros:

- official server code available
- larger file handling
- local paths/webhooks flexibility

Cons:

- extra ops burden
- does not expand bot permissions into arbitrary access

Use for:

- high-volume media-heavy Telegram bot workflows later

## Option D - TDLib / Client API

Pros:

- richer client-like access
- can serve use cases Bot API cannot

Cons:

- much higher privacy/security risk
- session/device management
- legal/terms review required
- stronger consent model needed
- likely separate service

Use only after:

- Bot API proven insufficient
- legal/security review
- explicit tenant/user consent model

## Option E - Scraping Public Telegram Web Pages

Pros:

- may expose some public channel pages

Cons:

- incomplete
- brittle
- rate/anti-abuse risk
- not an official data contract
- limited metadata

Decision:

- not production path

## Recommended Path

MVP/later V1:

```text
Bot API webhook + tenant-authorized bot installation
```

Architecture:

```text
TelegramBotWebhookInbox -> update idempotency -> normalize message -> source item/comment model
```

## Architecture Rule

Telegram monitoring requires authorization by chat/channel context.

Do not design for arbitrary Telegram surveillance.
