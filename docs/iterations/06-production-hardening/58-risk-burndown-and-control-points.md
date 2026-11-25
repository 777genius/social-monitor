# Iteration 06 - Risk Burndown And Control Points

## Burndown Goal
Reduce beta safety risk before launch.

## Day 1 Control Point
- Tenant isolation test scope is complete.
- Secret redaction boundaries are identified.
- CI gate requirements are agreed.

## Midpoint Control Point
- Tenant isolation tests cover REST, workers, events and realtime.
- Redaction tests catch provider-error leakage.
- Dashboards show core user-visible failures.

## Closeout Control Point
- No critical security gate is unresolved.
- Support can diagnose common failures.
- Quotas and backup/restore evidence are available.

## Escalation Threshold
Escalate immediately for cross-tenant access, secret leakage or breaking contract passing CI.

## Residual Risk Rule
Enterprise-grade gaps may carry forward; beta-safety blockers may not.
