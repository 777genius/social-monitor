# Iteration 05 - Cross-Functional Review Board

## Review Goal
Approve realtime delivery before production hardening depends on it.

## Required Reviewers
- Realtime lead.
- Backend lead.
- Mobile lead.
- Security/auth owner.
- QA owner.
- Operations representative.

## Review Questions
- Does WebSocket auth match REST auth?
- Can mobile recover missed events?
- Are notifications idempotent?
- Is realtime clearly not the source of truth?
- Are delivery failures observable?

## Required Evidence
- Channel auth tests.
- Reconnect/resync trace.
- Duplicate notification test.
- Event schema snapshots.
- Delivery metrics/log samples.

## Approval Rule
Promote only if realtime paths can be included safely in tenant isolation and observability hardening.
