# Product & Admin UX Boundaries

Date: 2026-05-31
Status: baseline product/admin UX memory

## Decision

User-facing product UX and admin/ops UX are separate surfaces.

Do not expose operational complexity to normal users, but do not hide operational state from admins.

## User Product UX

Users manage:

- topics;
- source bindings;
- scan frequency;
- summary rules;
- feed filters;
- digests;
- alerts;
- source account reauthorization;
- exports/deletion requests.

User-facing status should be understandable:

```text
active
paused
needs reauthorization
rate limited
delayed
source unavailable
budget exceeded
```

Avoid exposing:

- Kafka lag;
- DLQ internals;
- raw provider error codes;
- internal retry counts;
- worker names;
- connector stack traces.

## Admin/Ops UX

Admins need:

- connector health;
- provider costs;
- queue lag;
- DLQ messages;
- tenant budgets;
- failed scans;
- stuck summary jobs;
- compliance deletion backlog;
- webhook delivery failures;
- feature flag rollout;
- connector version rollout;
- provider quarantine controls.

Admin actions:

- pause provider;
- quarantine connector;
- retry scan;
- retry summary;
- replay event range with budget guard;
- disable tenant expensive ops;
- rotate connector credentials;
- export audit trail.

## Product Copy Rule

User-facing language explains outcome and action, not infrastructure.

Examples:

```text
Good: "Reddit needs reauthorization."
Bad: "OAuth refresh token failed with invalid_grant."

Good: "X scans are paused because the monthly budget is reached."
Bad: "ProviderBudgetGuard rejected connector.run.x.normal."
```

## Locked Decisions

1. Product UX and admin/ops UX are separate surfaces.
2. Normal users see actionable source/topic status.
3. Admins see operational truth and recovery actions.
4. Background systems require admin recovery paths.
5. Infrastructure terms do not leak into normal user UX.

