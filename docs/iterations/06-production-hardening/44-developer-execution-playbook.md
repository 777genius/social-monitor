# Iteration 06 - Developer Execution Playbook

## Reading Order
1. Read `01-security-privacy-controls.md`.
2. Read `35-first-sprint-ticket-cut.md`.
3. Read `38-architecture-compliance-audit.md`.
4. Read `40-implementation-risk-triage.md`.
5. Read `43-production-readiness-gap-analysis.md`.

## PR Slicing
- PR 1: tenant isolation tests.
- PR 2: credential encryption and redaction.
- PR 3: metrics and dashboards.
- PR 4: CI contract/migration/event gates.
- PR 5: quotas and cost controls.
- PR 6: backup/restore verification and support runbooks.

## Checks Before PR
- Cross-tenant negative tests cover all relevant paths.
- Secrets do not appear in logs/traces/errors.
- CI fails breaking contracts.
- Dashboards show user-visible failures.
- Quotas have user and operator states.

## Evidence To Attach
- Tenant isolation negative test result.
- Redaction proof for logs/traces/errors.
- CI gate output for contract/migration/event checks.
- Dashboard/alert screenshot or metric sample.
- Backup/restore or rollback verification when relevant.

## Architecture Guardrails
- Hardening must enforce, not only document.
- Policy/quota logic belongs in application/domain paths.
- Operational adapters must not introduce domain shortcuts.

## Escalate When
- Any cross-tenant access is reproducible.
- A credential appears in output.
- Support still needs shell access for common beta failures.
