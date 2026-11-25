# Iteration 05 - Realtime Delivery Overview

## Goal

Deliver scan progress, summary status, alerts, digests and external integrations reliably.

Realtime is not only WebSocket. It includes delivery semantics, retry rules, idempotency, user preferences and clear event states.

## Delivery Channels

- in-app realtime via WebSocket
- email digest
- webhook delivery
- future Slack/Telegram/push integrations
- API access for advanced users

## MVP Delivery Cutline

Build now:

1. WebSocket status hints for scan, feed and summary.
2. REST resync/read-model endpoints as source of truth.
3. In-app notification/read model for important scan/summary states.
4. One durable digest foundation with delivery attempt logging.
5. Webhook/API-key contracts and minimal implementation only if beta power-user need is explicit.

Defer:

1. Slack/Telegram/push integrations.
2. Complex notification rules engine.
3. User-defined automation workflows.
4. Marketplace integrations.
5. Guaranteed exactly-once external delivery.

## MVP Realtime Event Catalog

| Event | Channel | Purpose | Client Behavior |
| --- | --- | --- | --- |
| `scan.status.changed.v1` | WS/in-app | scan requested/running/completed/failed | update status, then refresh operation/feed when relevant |
| `source.health.changed.v1` | WS/in-app | source degraded, paused, quota-blocked | update badge, offer recovery action |
| `feed.items.available.v1` | WS/in-app | new feed items exist | show freshness hint and refresh feed via REST |
| `summary.status.changed.v1` | WS/in-app | summary requested/running/completed/failed/stale | update summary status, fetch detail via REST |
| `digest.ready.v1` | in-app/email | digest assembled | show digest status/detail |
| `delivery.attempt.changed.v1` | in-app/support | delivery attempt state changed | update delivery log/status |

Rules:

1. WS events carry resource ids and state hints, not full source payloads.
2. Mobile treats WS as freshness signal and reconciles through REST for durable views.
3. Every event includes tenant/workspace scope, sequence/cursor, correlation id and occurred-at.
4. Duplicate/out-of-order events are expected and must be harmless.
5. Missing replay window returns `resync_required`, not silent best effort.

## Phase Map

1. `01-websocket-service.md` - connection lifecycle and topic/status events.
2. `02-notifications-digests.md` - digest scheduler and notification preferences.
3. `03-webhooks-api-keys.md` - external delivery, signing and retry policy.
4. `04-mcp-future-interface.md` - future machine/agent interface planning.

## Detailed Steps

1. Define delivery event contract.
2. Define user notification preferences.
3. Define workspace-level delivery settings.
4. Add WebSocket auth and tenant scoping.
5. Add event fanout from Kafka/domain events to WS gateway.
6. Add digest generation jobs.
7. Add delivery attempts table.
8. Add webhook signing and replay protection.
9. Add per-channel retry policy.
10. Add idempotency keys for external delivery.
11. Add delivery status API.
12. Add frontend realtime status store.
13. Add backpressure and rate limits for realtime events.
14. Add unsubscribe/suppression logic.

## Edge Cases

- User has two devices connected.
- WebSocket reconnects after missing events.
- Digest job runs while summary is still generating.
- Webhook endpoint returns 500, 429 or times out.
- Webhook secret rotates during retry window.
- User disables notifications during queued delivery.
- Tenant is suspended before delivery attempt.
- Alert is duplicated across source bindings.
- Event is delivered after topic/source/summary was deleted or superseded.
- Mobile receives event for old workspace after switching context.
- Digest includes summary that became stale before delivery.
- Webhook payload would need sensitive raw source content.
- Delivery attempt succeeds externally but local status update fails.

## Pay Attention

- Delivery must be at-least-once internally and idempotent externally.
- WebSocket events must not leak cross-tenant data.
- Email/webhook delivery can lag; UI must show pending status.
- Delivery failure should not rollback scan/summary completion.
- Avoid building delivery as the source of truth; Feed/Summary read models remain authoritative.
- Idempotency is mandatory because internal delivery is at-least-once.
- External payloads should reference REST resources instead of embedding sensitive content.

## Quality Gates

- WebSocket auth and tenant scoping tests pass.
- Delivery retry matrix is tested.
- Webhook signatures are verified in tests.
- Digest fixtures cover empty, noisy and high-signal topics.
- Event replay does not duplicate user-visible alerts.
- WS replay/resync contract is tested for missed, duplicate and out-of-order events.
- Delivery attempt log proves idempotency, retry and preference recheck.

## Done Criteria

Iteration 05 is complete when users get realtime scan/summary updates and can receive at least one durable digest/alert channel with auditable delivery status.
