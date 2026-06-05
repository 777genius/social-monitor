# Iteration 06 - Cross-Functional Review Board

## Review Goal
Approve beta-safety readiness before launch.

## Required Reviewers
- Security owner.
- SRE/operations owner.
- Backend lead.
- QA owner.
- Support owner.
- Product owner.

## Review Questions
- Are tenant isolation gates green?
- Are secrets protected and redacted?
- Do CI gates block breaking contracts?
- Can support diagnose common failures?
- Are quotas, dashboards and backup/restore evidence ready?

## Required Evidence
- Tenant isolation results.
- Redaction tests.
- CI gate output.
- Dashboard/alert evidence.
- Support runbooks.

## Approval Rule
Promote only if beta can run with known owners, rollback paths and supportable operational signals.
