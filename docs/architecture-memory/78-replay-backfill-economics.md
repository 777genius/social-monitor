# Replay & Backfill Economics

Date: 2026-05-31
Status: baseline replay/backfill economics memory

## Decision

Replay and backfill are dangerous because they can create large source/API/LLM costs and duplicate side effects.

They must be bounded, auditable and usually low priority.

## Replay Run Model

```text
replay_run
  id
  tenant_id nullable
  source_type nullable
  event_type nullable
  date_range
  max_events
  max_items
  max_cost_usd
  dry_run
  reason
  requested_by
  approved_by nullable
  priority
  status
```

## Backfill Run Model

```text
backfill_run
  id
  tenant_id
  topic_id nullable
  source_binding_id
  source_type
  provider
  lookback_window
  max_items
  max_api_calls
  max_cost_usd
  dry_run
  status
```

## Required Guardrails

- dry-run estimate;
- max cost;
- max items/events;
- max runtime;
- low-priority queues;
- idempotency keys;
- duplicate side-effect prevention;
- approval for large/high-cost runs.

## Side Effects

Replay/backfill should not automatically:

- send old notifications;
- re-send webhooks;
- regenerate paid summaries without budget;
- alter digest history unexpectedly.

Side effects must be explicitly enabled by policy.

## Locked Decisions

1. Replay/backfill are bounded and audited.
2. Dry-run estimate is required for large runs.
3. Backfill uses low-priority queues.
4. Side effects are disabled by default.
5. Large/high-cost replay/backfill requires approval.

