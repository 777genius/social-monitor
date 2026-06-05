# Iteration 05 / Phase 03 - Webhooks And API Keys

## Objective

Prepare external integration surface for early power users.

## Steps

1. Implement tenant API key lifecycle: create, hash, scope, rotate, revoke.
2. Implement outbound webhook endpoint CRUD.
3. Add webhook signing.
4. Add retry and idempotency for deliveries.
5. Add public API rate limits.
6. Add audit events.
7. Add webhook payload versioning and event catalog.
8. Add replay protection with timestamp and delivery id.
9. Add endpoint disable/quarantine after repeated failures.

## MVP Webhook/API-Key Cutline

Implement only the minimal safe external surface:

1. API key create/list/revoke with hashed storage and show-once secret.
2. Scopes: `read:topics`, `read:feed`, `read:summaries`, `read:delivery_status`, `write:webhook_endpoints`.
3. Webhook endpoint CRUD for beta tenants if explicitly needed.
4. Signed outbound payloads with delivery id, timestamp and idempotency key.
5. Payloads reference resources; they do not embed raw source bodies, credentials or prompts.
6. Endpoint quarantine after repeated terminal/retryable failures.

Defer:

1. OAuth apps.
2. public developer portal.
3. marketplace integrations.
4. inbound webhooks from arbitrary providers.
5. complex per-event transformation templates.

## Webhook Payload Baseline

Every outbound payload includes:

- `payloadVersion`
- `deliveryId`
- `eventType`
- `occurredAt`
- `tenantId`
- `workspaceId`
- `resourceType`
- `resourceId`
- `idempotencyKey`
- `correlationId`
- `resourceLinks`
- `summary` with safe status fields only

Signing:

1. sign timestamp + delivery id + raw body
2. include key id so receiver can handle rotation
3. allow old and new secret during defined rotation window
4. reject replayed timestamp/delivery id outside window

## Edge Cases

- Webhook secret rotated during retry.
- API key leaked.
- Tenant endpoint slow.
- Duplicate webhook delivery.
- Consumer verifies signature with old secret during rotation window.
- Payload contains sensitive source content that should be referenced, not embedded.
- Tenant revokes API key while requests are in flight.
- Webhook endpoint succeeds after quarantine decision is already queued.
- Receiver verifies with old secret during grace window.
- API key has read scope but tries endpoint mutation.
- Payload version changes while receiver still expects old schema.

## Pay Attention

- Raw API keys shown only once.
- Webhook payloads should be small and reference REST resources.
- Retries must not be infinite.
- Webhook delivery is at-least-once; consumers must receive idempotency key.
- API key scopes must be narrower than tenant admin by default.
- External integrations are optional MVP surface; do not let them block core mobile/feed/summary loop.
- Keep audit logs separate from debug logs and safe for support review.

## Acceptance Criteria

- API key scopes enforced.
- Webhook signatures verify.
- Delivery retries are observable.
- Revoked key stops access.
- Webhook payload has version, delivery id, idempotency key and resource references.
- Repeatedly failing endpoint can be paused without affecting summaries/feed.
- Scope tests prove least-privilege behavior.
- Secret rotation/replay protection tests pass.
