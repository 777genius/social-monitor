# Delivery, Notifications & Webhooks

Date: 2026-05-31
Status: baseline delivery memory

## Decision

Delivery is a bounded context, not a helper function.

Delivery channels:

```text
in-app
email
webhook
Telegram later
push notifications later
```

## Required Tables

```text
notification_jobs
notification_deliveries
delivery_provider_events
suppression_list
unsubscribe_preferences
webhook_endpoints
webhook_delivery_attempts
```

## Delivery Provider Port

Provider adapters:

```text
SendGridAdapter
SESAdapter
PostmarkAdapter
TelegramDeliveryAdapter
PushNotificationAdapter
FakeDeliveryProvider
```

Do not put provider DTOs into product domain.

## Email Provider Events

Track:

```text
delivered
bounced
deferred
spam_complaint
unsubscribe
dropped
opened/clicked where enabled and privacy-appropriate
```

References:

- SendGrid Event Webhook: https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event/
- AWS SES event publishing: https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html

## Webhook Security

Outbound webhooks must be async, signed, retried and bounded.

Required:

- HMAC signature for MVP;
- timestamp;
- event id;
- payload/body hash;
- replay window;
- idempotency key;
- timeout hard limits;
- max payload size;
- SSRF protection;
- bounded retries;
- DLQ after retry exhaustion.

Evaluate RFC 9421 HTTP Message Signatures later for stronger interoperable signing.

Reference:

- RFC 9421 HTTP Message Signatures: https://www.ietf.org/rfc/rfc9421.html

## MVP Persistence

Webhook delivery state is behind ports:

- `WebhookEndpointRepositoryPort` stores endpoint metadata and status.
- `WebhookSecretVaultPort` stores signing secrets.
- `WebhookReplayStorePort` stores delivery ids inside the replay tolerance window.

MVP runtime supports in-memory adapters for deterministic local smoke and Prisma adapters when `DELIVERY_PERSISTENCE=prisma`.

Prisma webhook secrets must be encrypted with AES-256-GCM using `DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY`, a base64/base64url encoded 32-byte key. Do not store webhook signing secrets as plaintext, and do not log the returned one-time signing secret after endpoint creation.

Replay protection uses `(webhookEndpointId, deliveryId)` uniqueness. Duplicate active delivery ids return `replay_detected`; expired ids may be remembered again.

Notification preference reads are also behind `NotificationPreferenceReaderPort`. `PrismaNotificationPreferenceReader` persists recipient/channel suppression decisions so the last preference recheck before provider send survives process restarts.

## WebSub

Do not expose raw internal Kafka streams to customers.

If public feed subscription becomes a core feature, evaluate WebSub-style semantics.

Reference:

- W3C WebSub: https://www.w3.org/TR/websub/

## Locked Decisions

1. Delivery is a bounded context.
2. Webhook/email/push providers are replaceable adapters.
3. Failed delivery must not block ingestion or summaries.
4. Webhooks are signed, async, retried, bounded and SSRF-protected.
5. Webhook users need replay APIs.
6. Do not expose internal Kafka directly to customers.
