# 212. Tenant Webhook Contracts

## Status

Locked for integration/delivery baseline.

## Research Anchors

- GitHub webhook best practices: https://docs.github.com/webhooks/using-webhooks/best-practices-for-using-webhooks
- Stripe webhooks: https://docs.stripe.com/webhooks
- Stripe webhook signatures: https://docs.stripe.com/webhooks/signature

## Decision

Outbound tenant webhooks are a product contract with signed deliveries, idempotent event ids, retry policy and visible delivery logs.

## Event Envelope

```json
{
  "id": "evt_01j...",
  "type": "summary.created",
  "version": 1,
  "tenantId": "ten_123",
  "occurredAt": "2026-05-31T12:00:00Z",
  "data": {}
}
```

## Delivery Headers

Use:

- `X-SocialMonitor-Event-Id`;
- `X-SocialMonitor-Event-Type`;
- `X-SocialMonitor-Timestamp`;
- `X-SocialMonitor-Signature`;

## Rules

- Sign every delivery with tenant endpoint secret.
- Support secret rotation with overlap.
- Retry transient failures with bounded exponential backoff.
- Stop on permanent responses where policy defines them.
- Expose delivery attempts/logs to tenant admins.
- Redeliver same event id when replaying.
- Do not include raw source payloads or secrets.

## Best-Fact Choice

Webhook reliability depends on treating delivery as an auditable queue, not a synchronous HTTP callback hidden inside product logic.

