# Human Approval Workflows

Date: 2026-05-31
Status: baseline approval workflow memory

## Decision

High-impact actions require explicit approval workflows.

Approval must be auditable, scoped and time-bound.

## Approval Required For

```text
large backfill
event replay beyond small bounded range
tenant data export
tenant deletion
source policy risk override
enable browser/sidecar connector
enable expensive X provider fallback
increase tenant budget materially
purge raw payloads under special case
break-glass support access
```

## Approval Object

```text
approval_request
  id
  tenant_id
  action_type
  requested_by
  approver_id nullable
  status
  reason
  risk_summary
  estimated_cost
  estimated_rows
  expires_at
  approved_at nullable
  rejected_at nullable
```

## States

```text
pending
approved
rejected
expired
cancelled
executed
failed
```

## Safety Requirements

Approval must capture:

- exact scope;
- max cost/rows/time;
- requester;
- approver;
- reason;
- risk summary;
- rollback/compensation notes where applicable.

## Locked Decisions

1. High-impact actions use approval workflow.
2. Approval is scoped; no blanket approvals.
3. Approval has expiry.
4. Approval execution remains idempotent.
5. Approval decisions are audit events.

