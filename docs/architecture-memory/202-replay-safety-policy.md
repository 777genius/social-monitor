# 202. Replay Safety Policy

## Status

Locked for async/data baseline.

## Research Anchors

- Kafka design: https://kafka.apache.org/documentation/#design
- Debezium outbox pattern: https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
- Temporal docs: https://docs.temporal.io/

## Decision

Replay is for rebuilding projections, repairing data and reprocessing deterministic artifacts. Replay must not repeat external side effects unless explicitly authorized.

## Safe to Replay

Usually safe:

- read model projections;
- search index rebuilds;
- vector index rebuilds from retained embeddings/text;
- dedupe/cluster recomputation;
- summary recomputation when artifact version changes and no notification is sent;
- analytics exports with idempotent partition overwrite.

Restricted:

- sending notifications;
- billing/meter events;
- source provider writes;
- webhooks to tenant systems;
- account deletion actions;
- credential refresh actions.

## Replay Rules

- Every replay has scope, owner, reason and dry-run option where practical.
- Side-effecting consumers check replay mode and suppress or require approval.
- Replayed events/jobs use new operation ids but preserve original entity references.
- Replays write audit/operational events.
- Replays are rate-limited and tenant-scoped by default.

## Best-Fact Choice

Replay is a powerful repair tool and a dangerous side-effect amplifier. Make side effects opt-in, not accidental.

