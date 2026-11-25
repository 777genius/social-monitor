# Iteration 05 - Phase Step Matrix

## Phase 01 - WebSocket Service

### Build Steps

1. Define event types.
2. Add socket auth.
3. Add tenant binding.
4. Add topic subscriptions.
5. Add scan status events.
6. Add summary status events.
7. Add reconnect flow.
8. Add heartbeat.

### Dependencies

- Domain events.
- Auth/session service.

### Edge Cases

- Membership revoked during connection.
- Reconnect misses events.
- Multiple devices receive same event.

### Validation

- No cross-tenant event leakage.

## Phase 02 - Notifications Digests

### Build Steps

1. Define preferences.
2. Define digest schedule.
3. Define digest content.
4. Build digest job.
5. Render digest.
6. Add delivery status.
7. Add unsubscribe/suppression.

### Dependencies

- Summary artifacts.
- Feed read model.

### Edge Cases

- Empty digest.
- Summary not ready.
- User disables digest after scheduling.

### Validation

- Digest is coherent and traceable to source items.

## Phase 03 - Webhooks API Keys

### Build Steps

1. Create API keys.
2. Hash and scope keys.
3. Configure webhook endpoints.
4. Sign payloads.
5. Retry failed delivery.
6. Track attempts.
7. Add replay protection.

### Dependencies

- Delivery event catalog.

### Edge Cases

- Endpoint returns 429.
- Secret rotated.
- Duplicate delivery.

### Validation

- Consumer can verify signature and handle retries.

## Phase 04 - MCP Future Interface

### Build Steps

1. Define read-only machine endpoints.
2. Define allowed resources.
3. Define auth scopes.
4. Define audit logs.
5. Define rate limits.
6. Defer implementation until needed.

### Dependencies

- Stable public API.

### Edge Cases

- Agent triggers expensive loops.
- Agent requests private content.

### Validation

- Future interface is bounded and safe.

