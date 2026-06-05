# Iteration 05 - Ticket Breakdown

## Phase 01 - WebSocket Service

### T05-01 - Implement Realtime Gateway

- Context: Realtime Delivery
- Layer: API adapter/application
- Artifacts: WebSocket gateway, channel auth, event DTOs
- Steps:
  1. Define workspace/topic channels.
  2. Authenticate connections.
  3. Authorize tenant channel joins.
  4. Publish scan, feed and summary status events.
  5. Add heartbeat and reconnect hints.
- Edge cases:
  - User loses permission while connected.
  - Mobile reconnect misses events.
- Acceptance:
  - Mobile receives status updates without polling.

## Phase 02 - Notifications Digests

### T05-02 - Build Notification Read Model

- Context: Notification
- Layer: Application/read model
- Artifacts: notification preferences, notification records, digest jobs
- Steps:
  1. Consume feed and summary events.
  2. Create notification records idempotently.
  3. Support read/unread state.
  4. Add digest scheduling.
  5. Add quiet hours rules.
- Edge cases:
  - Same event delivered twice.
  - User disables notifications after record creation.
- Acceptance:
  - Duplicate events do not create duplicate notifications.

## Phase 03 - Webhooks API Keys

### T05-03 - Add External Delivery Ports

- Context: Delivery
- Layer: Domain/application/adapters
- Artifacts: API keys, webhook endpoints, signing, delivery log
- Steps:
  1. Store hashed API keys.
  2. Add webhook endpoint config.
  3. Sign outbound payloads.
  4. Retry with backoff.
  5. Persist delivery attempts.
- Edge cases:
  - Webhook endpoint returns 500 repeatedly.
  - API key is revoked during delivery.
- Acceptance:
  - External delivery is retryable, auditable and tenant-scoped.

## Phase 04 - Future Interface

### T05-04 - Document Future MCP/Internal Interface

- Context: Platform
- Layer: Contract planning
- Artifacts: future interface notes, non-MVP guardrail
- Steps:
  1. Define possible future machine-consumption API.
  2. Keep it outside beta critical path.
  3. Document required auth and audit concerns.
- Edge cases:
  - Future interface distracts from MVP delivery.
  - Internal automation bypasses tenant authorization.
- Acceptance:
  - Future extension is documented without expanding MVP scope.
