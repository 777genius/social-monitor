# 223 - Source Telegram Implementation V1

## Decision

Telegram integration starts with Bot API where the tenant explicitly installs/adds the bot to channels/groups that the bot is allowed to read.

Full Telegram client access through TDLib/MTProto is a separate future capability with stronger policy, privacy and operational requirements.

## Sources

- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram bot webhooks: https://core.telegram.org/bots/webhooks
- Telegram bots FAQ: https://core.telegram.org/bots/faq
- Telegram API terms: https://core.telegram.org/api/terms
- Telegram Terms of Service: https://telegram.org/tos
- TDLib official repository: https://github.com/tdlib/td

## V1 Scope

V1 supports:

- tenant connects a bot token
- bot receives channel/group updates where Telegram permits
- webhook ingestion for production
- long polling only for local/dev or controlled fallback
- message normalization
- channel/group source binding health

V1 does not support:

- reading arbitrary public Telegram channels without authorization
- user-account automation
- ghost/stealth client behavior
- bypassing privacy settings
- training AI models on Telegram data
- scraping content outside official access paths

## Bot API Update Handling

Telegram Bot API supports two mutually exclusive update paths:

- `getUpdates` pull
- webhook push

Production uses webhooks.

Local/dev may use `getUpdates`.

The adapter must never run webhook and long polling for the same bot token at the same time.

## Webhook Security

Required:

- HTTPS endpoint
- token stored encrypted
- secret token/header validation where supported
- tenant/source lookup by stable webhook route
- idempotency by Telegram `update_id`
- bounded body size
- retry-safe processing

Webhook handler writes an inbox record first, then queues normalization.

## Offset And Ordering

For `getUpdates`, update confirmation uses offset:

```text
next_offset = last_processed_update_id + 1
```

For webhooks, the platform must still dedupe by `update_id` because retries and delivery reordering can happen.

## Canonical Mapping

Telegram message maps to:

- provider message id
- chat/channel id
- chat/channel title when available
- text/caption
- media references
- author/sender reference when available and permitted
- message timestamp
- edit timestamp when available
- reply/forward metadata where policy permits
- raw payload pointer

## Policy Gate

Before activation:

- tenant proves they control or are allowed to monitor the chat/channel
- bot token validates
- bot has required permissions
- data retention policy is selected
- AI-summary use is allowed by product policy and source terms

If source terms restrict AI training, this product must distinguish summarization for tenant use from model training and must not use Telegram data for training/fine-tuning.

## TDLib Future Boundary

TDLib is only considered if:

- use case cannot be served by Bot API
- legal review approves it
- user consent model is explicit
- device/session security is designed
- operational isolation is stronger than Bot API

TDLib must be a separate adapter and likely a separate service.

## Architecture Rule

Telegram is not one connector. It is at least two access models:

```text
telegram_bot_api
telegram_client_api_future
```

Do not hide those differences behind a false single implementation.
