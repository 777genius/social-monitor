# Workflow Orchestration & Temporal Boundary

Date: 2026-05-31
Status: baseline workflow orchestration memory

## Decision

Do not introduce Temporal in MVP by default, but design workflow boundaries so Temporal can be adopted later without rewriting domain logic.

MVP uses:

```text
Postgres state machines
RabbitMQ task queues
Kafka integration events
idempotent handlers
scheduler leases
```

Temporal becomes attractive when workflows become long-running, highly stateful, human-in-the-loop or hard to reason about with queues alone.

References:

- Temporal TypeScript SDK: https://docs.temporal.io/develop/typescript
- Temporal Workflows: https://docs.temporal.io/workflows

## Workflow Candidates

Good future Temporal candidates:

```text
tenant deletion workflow
source account reauthorization workflow
large backfill with approvals
compliance deletion propagation
digest generation with multiple dependencies
provider migration/failover workflow
enterprise export workflow
```

Not necessary for MVP:

```text
single connector scan
simple summary job
email delivery retry
RSS polling
HN item fetching
```

## Required Boundary Now

Model workflows explicitly:

```text
ScanRun
ConnectorRun
SummaryJob
DigestJob
ComplianceDeletionWorkflow
BackfillRun
ExportRun
```

Each has:

- state;
- attempts;
- idempotency key;
- owner/tenant;
- timeout;
- retry policy;
- audit trail;
- cancellation support.

## Temporal Adoption Rule

Adopt Temporal only when:

- workflow logic is hard to operate with explicit state machines;
- recovery/retry code becomes too complex;
- long-running orchestration dominates worker code;
- team can operate Temporal responsibly.

## Locked Decisions

1. MVP does not require Temporal.
2. Workflow entities are modeled explicitly from day one.
3. Temporal is a later orchestration runtime, not domain model.
4. Domain/application workflows must not depend on queue implementation details.
5. Long-running compliance/export/backfill workflows are likely Temporal candidates.

