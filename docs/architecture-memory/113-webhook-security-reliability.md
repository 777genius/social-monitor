# 113. Webhook Security and Reliability

## Status

Locked for implementation blueprint.

## Research Anchors

- GitHub webhook best practices: https://docs.github.com/webhooks/using-webhooks/best-practices-for-using-webhooks
- GitHub validating webhook deliveries: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- Stripe webhook signatures: https://docs.stripe.com/webhooks/signature
- Stripe webhook endpoint guidance: https://docs.stripe.com/webhooks

## Decision

All inbound and outbound webhooks require signature verification, replay protection, idempotency and async processing.

## Inbound Webhooks

Rules:

- verify signature before parsing business payload;
- preserve raw body bytes for providers that sign raw payload;
- reject missing/invalid signatures;
- check timestamp tolerance where provider supports it;
- store delivery id/event id for dedupe;
- persist accepted event before processing side effects;
- return fast 2xx after durable acceptance, not after full business workflow.

Supported inbound examples:

- billing provider events;
- future source provider callbacks;
- enterprise integration callbacks.

## Outbound Webhooks

Rules:

- sign every delivery with HMAC-SHA256 or provider-compatible scheme;
- include event id, timestamp and signature headers;
- retry with exponential backoff and max delivery window;
- expose delivery logs to tenant admins;
- allow endpoint secret rotation with overlap;
- do not send secrets or raw source payloads.

## Processing Model

```text
HTTP receive -> verify -> persist delivery -> enqueue job -> return 2xx
worker -> idempotency check -> fetch latest authoritative state if needed -> apply side effect
```

For billing-style webhooks, treat webhook data as a signal and fetch authoritative state from provider when correctness matters.

## Best-Fact Choice

Webhook handlers must be generated/scaffolded with signature and raw-body support. Security cannot depend on each engineer remembering framework middleware ordering.

