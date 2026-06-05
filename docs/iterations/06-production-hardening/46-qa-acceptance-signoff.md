# Iteration 06 - QA Acceptance Signoff

## Signoff Goal
Confirm that the MVP is safe enough for controlled beta.

## Acceptance Scenarios
- Tenant isolation tests pass across APIs, workers, events and realtime.
- Secrets are encrypted and redacted.
- CI blocks breaking contracts, events and migrations.
- Dashboards show scan, summary, queue, cost and delivery failures.
- Quotas and backup/restore checks pass.

## Negative Cases
- Cross-tenant access attempt.
- Provider error includes credential-like content.
- Breaking contract reaches CI.
- Quota exhaustion during scheduled work.

## Regression Coverage
- Tenant isolation suite.
- Secret redaction tests.
- CI gate fixtures.
- Backup/restore verification.

## Residual Risks
- Enterprise compliance certification can be deferred.
- Advanced autoscaling can be deferred.

## Approvers
- Security owner.
- SRE owner.
- Backend lead.
- Support owner.
