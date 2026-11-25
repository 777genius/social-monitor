# Iteration 05 - PR Review Rubric

## Review Goal
Ensure realtime PRs are authorized, recoverable, idempotent and consistent with REST state.

## Architecture Checks
- WebSocket auth matches REST auth.
- Events are versioned and tenant-scoped.
- Realtime does not replace source of truth.
- Gateway uses application services.

## Test And Evidence Checks
- Channel authorization tests pass.
- Reconnect/resync scenario passes.
- Duplicate notification test passes.
- Event schema snapshots are reviewed.

## Edge Case Checks
- Token expiry.
- Access revoked while connected.
- Duplicate event delivery.
- Snapshot/live event race.

## Merge Blockers
- Unauthorized subscription succeeds.
- Reconnect loses state permanently.
- Duplicate event creates duplicate notification.
- Event leaks internal/provider-specific data.
