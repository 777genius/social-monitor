# 197. Queue Priority and Backpressure

## Status

Locked for async runtime baseline.

## Research Anchors

- RabbitMQ priority queues: https://www.rabbitmq.com/docs/priority
- RabbitMQ queues: https://www.rabbitmq.com/docs/queues

## Decision

Prefer separate queue classes over many priority levels. Use RabbitMQ priorities sparingly because priority queues add CPU/memory overhead and can weaken intuitive ordering behavior.

## Queue Classes

Initial classes:

- `critical-control`: deletion, credential/security, billing-critical;
- `freshness`: regular scans;
- `ai-interactive`: user-triggered summaries;
- `ai-batch`: scheduled digest/summaries;
- `backfill`: low-priority historical work;
- `projection`: read model rebuild/repair;
- `delivery`: notifications/webhooks.

## Backpressure

When backlog or downstream pressure rises:

- pause backfills first;
- reduce deep comment hydration;
- delay batch summaries;
- keep credential/security/deletion work prioritized;
- lower source fetch concurrency by source;
- emit user/admin-visible degraded state.

## Priority Rules

- Do not use more than a small number of priority levels.
- Do not mix very long jobs and short urgent jobs in the same queue.
- Do not rely on priority for tenant fairness; scheduler owns fairness.
- Monitor job age per queue class, not only total depth.

## Best-Fact Choice

Queue priority is a tool, not a scheduler. Separate queues plus explicit scheduler/backpressure policy are easier to reason about than one queue with many priorities.

