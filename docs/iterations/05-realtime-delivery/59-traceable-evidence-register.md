# Iteration 05 - Traceable Evidence Register

## Evidence Goal
Prove that realtime is authorized, recoverable and idempotent.

## Critical Audit Evidence
- WebSocket events are hints and REST/read models remain source of truth.
- Replay/resync tests cover missed, duplicate and out-of-order events.
- Delivery attempt idempotency and preference recheck evidence exists.
- External payloads reference resources and avoid sensitive raw content.
- Membership revoke, preference change, endpoint quarantine and superseded-summary race fixtures pass.
- Digest/replay/webhook temporal fixtures prove UTC window identity, DST behavior, replay expiry and timestamp skew.

## Decision Evidence
- WebSocket auth decision.
- Channel authorization model.
- Reconnect/resync contract.
- Notification idempotency decision.
- Event DTO versioning rule.

## Ticket Evidence
- Gateway tickets link to channel auth tests.
- Resync tickets link to reconnect traces.
- Notification tickets link to duplicate-event tests.
- Observability tickets link to delivery logs/metrics.

## Review Evidence
- Security owner reviews tenant-channel access.
- Mobile lead reviews recovery behavior.
- Operations owner reviews delivery diagnostics.

## Handoff Evidence
- Hardening iteration accepts realtime paths for isolation tests.
- Support receives missed-update diagnostic notes.

## Missing Evidence Blocks
- Temporal delivery evidence absent for digest window, replay expiry or webhook timestamp skew.

## Delivery Replay Safety Gate Evidence

- Gate: `npm run check:delivery-replay`
- Release gate id: `delivery-replay-idempotency`
- Focused spec: `libs/delivery/adapters/persistence/in-memory-realtime-event.repository.spec.ts`

Verified guarantees:

- unauthorized REST replay without workspace role is covered by `test/e2e/realtime-events.list.e2e-spec.ts`;
- realtime replay cursors use absolute `afterSequence`, not retained-array offsets;
- stale cursors older than the retained replay window return `resyncRequired: true` instead of partial event loss;
- `DELIVERY_PERSISTENCE=prisma` can persist realtime replay events through `PrismaRealtimeEventRepository`;
- Prisma realtime replay protects `(tenantId, workspaceId, channel, sequence)` with a unique constraint and use-case retry on sequence conflicts;
- delivery Prisma smoke covers record, list, caught-up cursor and invalid cursor behavior for realtime events;
- current REST snapshot without cursor remains available from the retained window;
- caught-up replay cursor returns no events and does not force resync;
- duplicate delivery queue commands reuse the same delivery attempt through idempotency key;
- `DELIVERY_PERSISTENCE=prisma` can persist webhook endpoint metadata, encrypted webhook secrets and webhook replay delivery ids;
- Prisma webhook secrets use AES-256-GCM and require `DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY`;
- delivery Prisma smoke covers webhook create, sign, verify, replay rejection, disable and list behavior;
- notification preference recheck happens immediately before provider send and suppresses delivery without calling provider.
