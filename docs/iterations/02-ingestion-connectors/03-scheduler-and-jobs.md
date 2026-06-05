# Iteration 02 / Phase 03 - Scheduler And Jobs

## Objective

Build tenant-aware scan scheduling and job execution.

## Steps

1. Model scan policy: interval, source binding, topic, enabled state.
2. Implement scheduler loop with leases.
3. Enqueue scan jobs through RabbitMQ.
4. Enforce tenant/source concurrency caps.
5. Add retry/DLQ policy.
6. Add scan status state machine.
7. Add manual scan trigger with idempotency.

## State Re-Check Rules

Every scan job uses both a creation snapshot and current-state checks.

Required checks:

1. Before enqueue: topic enabled, source binding enabled, scan policy valid and quota preflight passes.
2. After lease claim: re-check topic, source binding, tenant/workspace access, credential state and quota.
3. Before provider call: re-check source binding, capability profile snapshot compatibility and provider budget.
4. Before item persistence: re-check topic/source binding still allows writes or mark job cancelled by policy.
5. Before cursor commit: confirm durable item persistence and job fencing token.
6. Before retry: re-check retry budget, quota, source health and whether the source/topic is still enabled.

MVP behavior:

- disabled topic/source before provider call: cancel job with user-visible status
- disabled topic/source after provider fetch but before write: persist nothing unless explicit policy allows safe terminal write
- scan policy changed: current job uses snapshot only if snapshot policy is still compatible; otherwise cancel/requeue
- credential revoked: fail terminal with reconnect-source recovery action
- quota exhausted after enqueue: cancel before provider call and record usage rejection

## Temporal Rules

1. Store all scheduler timestamps in UTC.
2. Use injected `Clock` in domain/application tests.
3. Define whether next scan is based on last scheduled, started or completed attempt; MVP default should be last accepted/completed attempt unless ADR says otherwise.
4. Use jitter only if documented and bounded; jitter must not violate provider minimum interval.
5. Provider published timestamps are not trusted for scheduling decisions.
6. Keep both `providerPublishedAt` and `observedAt` when available.
7. Treat provider future timestamps as warnings and cap feed ordering by observed time policy.
8. Manual scan shares throttling/idempotency window with scheduled scan according to source binding policy.
9. Backfill windows use explicit inclusive start/exclusive end unless provider cursor contract forces another model.

## Edge Cases

- Two scheduler replicas claim same scan.
- Scan interval too aggressive.
- Source disabled mid-scan.
- Job retries after cursor advanced.
- Tenant quota exhausted.
- Scan policy changes after job enqueue.
- Credential rotates after lease claim.
- Capability profile changes while job is queued.
- Worker lease expires while provider call is in progress.
- Provider returns future timestamps.
- RSS feed reorders old items into a new page.
- Daylight-saving transition changes user's displayed schedule.
- Manual scan happens seconds before scheduled scan.

## Pay Attention

- Lease must have fencing/idempotency.
- Scheduling should check provider/tenant budgets.
- DLQ must preserve enough context for repair.
- Re-checks must happen in worker/use-case code, not only scheduler UI/API validation.
- Snapshot semantics must be visible in scan attempt status for support.
- Time-window semantics must be testable with fake clock and provider fixtures.

## Acceptance Criteria

- Scheduled scans run repeatedly.
- Duplicate scheduler does not double-run scan.
- Manual scan returns status.
- DLQ captures poison job.
- Queued/in-flight state change fixtures prove cancel/retry/terminal behavior.
- Fake-clock tests cover interval boundaries, provider future timestamps and manual/scheduled overlap.
