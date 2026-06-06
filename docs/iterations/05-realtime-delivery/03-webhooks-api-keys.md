# Iteration 05 / Phase 03 - Webhooks And API Keys

## Objective

Prepare external integration surface for early power users.

## Steps

1. Implement tenant API key lifecycle: create, hash, scope, revoke. Rotation is deferred from MVP hardening.
2. Implement outbound webhook endpoint create/list/read/disable management.
3. Add webhook signing.
4. Add retry and idempotency for deliveries.
5. Add public API rate limits.
6. Add audit events.
7. Add webhook payload versioning and event catalog.
8. Add replay protection with timestamp and delivery id.
9. Add endpoint disable/quarantine after repeated failures.

## Current Implementation Evidence

Status: `Implemented for MVP`.

Commits:

- `3b1dbc4` - scoped API key lifecycle.
- `8256489` - safe API key listing.
- `26887ec` - API key scope enforcement for webhook endpoint management.
- `57aa16a` - webhook endpoint list/read/disable management.
- `56115ff` - signed outbound webhook payloads.
- `f74e9b8` - webhook signature replay protection.
- `a85be05` - webhook endpoint quarantine.
- `d9eee51` - public API rate limit for webhook management.
- `a5bd3fd` - support-safe public API audit events.
- `ce80787` - webhook event catalog and payload version constant.

Test evidence:

- `test/e2e/api-keys.lifecycle.e2e-spec.ts`
- `test/e2e/api-keys.list.e2e-spec.ts`
- `test/e2e/webhook-endpoints.api-key-scope.e2e-spec.ts`
- `test/e2e/webhook-endpoints.management.e2e-spec.ts`
- `test/e2e/webhook-endpoints.signing.e2e-spec.ts`
- `test/e2e/webhook-signatures.replay.e2e-spec.ts`
- `test/e2e/webhook-endpoints.quarantine.e2e-spec.ts`
- `test/e2e/webhook-endpoints.rate-limit.e2e-spec.ts`
- `test/e2e/webhook-endpoints.audit.e2e-spec.ts`

Quality gates used per implementation slice:

- `npm run check:architecture`
- `npm run build`
- targeted unit tests for changed feature slices
- targeted e2e tests for changed REST flows
- targeted ESLint for changed files
- `git diff --check`

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
3. allow old and new secret during defined rotation window in post-MVP hardening
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

- API key scopes enforced: covered by `webhook-endpoints.api-key-scope.e2e-spec.ts`.
- Webhook signatures verify: covered by `webhook-endpoints.signing.e2e-spec.ts`.
- Delivery retries are observable: covered by delivery attempt state/retry/send slices from Phase 02.
- Revoked key stops access: covered by `api-keys.lifecycle.e2e-spec.ts` and webhook scope e2e.
- Webhook payload has version, delivery id, idempotency key and resource references: covered by signing e2e and event catalog unit tests.
- Repeatedly failing endpoint can be paused without affecting summaries/feed: covered by `webhook-endpoints.quarantine.e2e-spec.ts`.
- Scope tests prove least-privilege behavior: covered by `webhook-endpoints.api-key-scope.e2e-spec.ts`.
- Replay protection tests pass: covered by `webhook-signatures.replay.e2e-spec.ts`.

## Explicit MVP Deferrals

- API key rotation endpoint.
- Webhook signing secret rotation with dual-secret grace window.
- Redis-backed distributed rate limit counters.
- Durable SQL audit-log persistence and outbox publishing.
- Developer portal/OAuth apps.
