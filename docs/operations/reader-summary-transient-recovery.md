# Reader summary dependency recovery

Gateway tasks keep one admitted stream open for a 30-second settlement grace
beyond the nominal task budget, capped by the SDK's one-hour admission ceiling.
Caller cancellation still wins. A valid late response is validated and attested
by the same SDK; the adapter does not submit another inference to retrieve it.
After hard cancellation the gateway stores status, not recoverable response text.
The diagnostic includes elapsed, nominal and hard budgets, effect, cleanup and
strictly validated execution/request references for correlation with the gateway;
no prompt, response or credential is logged.

The periodic scheduler may create at most two deterministic replacement jobs
for a V3 dependency failure marked `executions_closed`. Pauses are five minutes
before replacement one and ten minutes before replacement two. Recovery expires
48 hours after the period ends. The scheduler revisits existing failed daily
periods after UTC midnight and does not create missing historical periods. A
queued or completed replacement leaves the tick budget available for current
work. Recovery respects quota, queue capacity, current V3
selection and normal publication guards. Each replacement has the same period
and scope, but a new preparation cutoff: newly arrived source data can enter
through normal frozen preparation. The original failure remains in history.
The keys end in `:transient-retry:1` and `:transient-retry:2`, so process restarts
and repeated scheduler ticks do not reset the budget. No schema migration is
required; durable job uniqueness supplies the identity fence.

Recovery can repeat paid generation after a known closed request, including
already successful batches from the failed job. It is bounded, not free replay.
Unknown effects, unacknowledged cleanup (including earlier completed batches),
auth/quota failures, quality failures,
native operator-owned jobs and ordinary API requests do not receive automatic
replacement authority. Previously recorded failures lack the new closure proof
and remain for explicit operational reconciliation; do not rewrite their reason
to manufacture that proof.

The independent nginx/preflight synchronization step lives in platform-infra:
`deploy/social-monitor/posts-collection/reader-boundary-release.md`. Updating the
application image alone cannot repair a stale host-owned proxy config pin.
