# Iteration 06 - Architecture Decision Record Seeds

## Purpose
List hardening decisions that define beta safety and operational responsibility.

## ADR Seeds
- Define beta tenant isolation gate.
- Define secret encryption and redaction policy.
- Define CI gates for OpenAPI, events and migrations.
- Define quota and cost-control policy.
- Define observability baseline for user-visible failures.

## Alternatives To Capture
- Manual review of contracts vs blocking CI gates.
- Infrastructure-only metrics vs user-outcome metrics.
- Soft quotas vs enforced quotas.

## Consequences To Record
- Blocking gates slow changes but protect beta users.
- User-outcome dashboards improve support but require domain instrumentation.
- Enforced quotas prevent cost spikes but require clear UX states.

## Revisit Triggers
- Beta incident exposes missing observability.
- Quotas block legitimate usage.
- Compliance requirements become enterprise-facing.
