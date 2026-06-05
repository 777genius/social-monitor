# Iteration 06 - Iteration Acceptance Contract

## Provider
Hardening team provides beta safety, support readiness, security gates and operational evidence.

## Receiver
Iteration 07 launch team receives go/no-go evidence and supportable operating state.

## Handoff Promises
- Tenant isolation tests cover core paths.
- Secrets are encrypted and redacted.
- CI blocks breaking contracts, events and migrations.
- Dashboards cover user-visible failures.
- Quotas, backup/restore and runbooks are ready.

## Receiver Expectations
- Launch can make go/no-go decisions from evidence.
- Support can triage common failures.
- Operations can pause or rollback safely.

## Blocking Defects
- Cross-tenant access reproducible.
- Secret leakage possible.
- Support cannot diagnose common failures.
- Breaking contract passes CI.

## Allowed Exceptions
- Enterprise compliance certification can wait.
- Advanced autoscaling can wait.
