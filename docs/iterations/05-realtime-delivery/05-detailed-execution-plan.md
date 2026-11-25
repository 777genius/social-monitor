# Iteration 05 - Detailed Execution Plan

## Purpose

Implement realtime status and delivery channels without creating duplicate or leaky notifications.

## Phase 01 - WebSocket Service

### Steps

1. Define WebSocket event contract.
2. Add authenticated connection.
3. Bind connection to tenant/workspace.
4. Add topic subscription.
5. Add scan status events.
6. Add summary status events.
7. Add feed item notification events.
8. Add reconnect/resync endpoint.
9. Add heartbeat.
10. Add backpressure limits.
11. Add replay window and resync-required signal.
12. Add per-subscription sequence/cursor tracking.
13. Add authorization recheck on membership/token changes.

### MVP WebSocket Implementation Steps

1. Define WS protocol version and event envelope.
2. Implement connection auth and workspace binding.
3. Implement subscription authorization per workspace/topic/resource.
4. Implement channel naming without provider secrets/raw source query data.
5. Implement fanout adapter from domain/integration events.
6. Implement replay cursor storage with bounded replay window.
7. Implement `resync_required` response.
8. Implement REST snapshot resync contract with mobile.
9. Implement duplicate/out-of-order handling tests.
10. Implement slow-client backpressure and disconnect policy.

### Edge Cases

- User connects from multiple devices.
- User loses connection during scan.
- Tenant membership removed while socket is open.
- Event arrives after topic deletion.
- Replay cursor is older than retention window.
- Duplicate event arrives after REST snapshot refresh.
- Client sends replay cursor from another workspace.
- Summary status arrives before summary list is loaded.
- Authorization changes while replay is being served.
- Slow mobile client cannot keep up with burst of scan/feed events.

### Acceptance Gate

- Realtime state updates are tenant-safe and resumable.
- REST snapshot remains source of truth and WS only advances visible status.
- Replay/resync behavior is proven for missed, duplicate and out-of-order events.

## Phase 02 - Notifications Digests

### Steps

1. Define notification preferences.
2. Define digest frequency.
3. Define digest content schema.
4. Add digest scheduler.
5. Add digest rendering.
6. Add email adapter or placeholder.
7. Add suppression/dedupe rules.
8. Add delivery status tracking.
9. Add digest idempotency key.
10. Add provenance for included summaries/feed items.
11. Add stale/no-signal digest rules.

### MVP Digest Implementation Steps

1. Define notification preference value objects.
2. Define digest window and deterministic content hash.
3. Define delivery attempt state machine.
4. Implement digest assembly from summary/feed read models.
5. Implement no-signal/stale/low-signal suppression rules.
6. Implement email adapter or fake delivery adapter for MVP tests.
7. Re-check preferences and tenant/resource state before send.
8. Persist delivery attempt transitions.
9. Add DLQ visibility and support-safe failure classes.
10. Expose delivery status API/read model.

### Edge Cases

- Digest has no high-signal items.
- Topic summary is still running.
- User disables digest after job queued.
- Multiple topics cite same item.
- Duplicate digest job runs for the same window.
- Summary becomes stale before digest delivery.
- Tenant suspended after digest queued.
- Provider accepts delivery but local attempt update fails.
- User disables digest while assembly is running.
- Same item appears in multiple topics inside one digest.

### Acceptance Gate

- User can receive one coherent digest with status tracked.
- Duplicate jobs do not duplicate notifications and preferences are checked before delivery.
- Delivery attempt states and suppression decisions are visible and idempotent.

## Phase 03 - Webhooks API Keys

### Steps

1. Define API key scopes.
2. Hash API keys.
3. Add webhook endpoint config.
4. Add webhook signing.
5. Add retry policy.
6. Add delivery attempts.
7. Add replay protection.
8. Add webhook event catalog.
9. Add endpoint quarantine after repeated failures.
10. Add payload versioning and resource-reference policy.
11. Add API key scope regression tests.

### MVP Webhook/API Key Implementation Steps

1. Implement show-once API key creation and hashed storage.
2. Implement minimal read scopes and endpoint mutation scope.
3. Implement key revoke/rotate audit events.
4. Implement webhook endpoint CRUD if beta need exists.
5. Implement signing with key id, timestamp and delivery id.
6. Implement replay protection.
7. Implement resource-reference payloads.
8. Implement retry/backoff and endpoint quarantine.
9. Implement delivery attempt log and support-safe error classes.
10. Add scope, signature, replay and quarantine tests.

### Edge Cases

- Endpoint returns 429.
- Secret rotates during retries.
- Tenant disabled after webhook queued.
- Consumer receives duplicate event.
- API key is rotated while client still uses old key.
- Webhook secret rotation overlaps retry.
- Payload version changes while receiver expects old version.
- Endpoint returns 200 but with very slow response.
- Webhook endpoint tries to infer raw source content not included in payload.
- Key has read scope but attempts webhook endpoint mutation.

### Acceptance Gate

- Webhooks are signed, idempotent and observable.
- Failing webhooks do not block core feed/summary workflows.
- Webhook/API-key work remains optional and cannot block MVP core loop unless beta scope explicitly requires it.

## Phase 04 - MCP Future Interface

### Steps

1. Define what agents may query.
2. Define read-only source/summary APIs.
3. Define tenant authorization requirements.
4. Define audit logging.
5. Define rate limits.
6. Keep implementation deferred unless beta needs it.

### Edge Cases

- Agent requests private source content.
- Agent tries to mutate topic config without permission.
- Agent causes expensive summary regeneration loop.

### Acceptance Gate

- Future machine interface is documented without destabilizing MVP.
