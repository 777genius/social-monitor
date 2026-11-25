# Iteration 06 / Phase 01 - Security And Privacy Controls

## Objective

Add minimum viable security/privacy controls before beta.

## Steps

1. OIDC/PKCE auth integration or dev-to-prod auth plan.
2. RBAC/ABAC permission checks.
3. Tenant isolation tests.
4. Source credential encryption.
5. Audit event taxonomy implementation for critical actions.
6. Privacy purpose registry baseline.
7. DSAR/deletion workflow skeleton.
8. Repository guard checks for every tenant-owned table/read model.
9. Worker tenant-context validation before job execution.
10. Event-consumer tenant-scope validation before processing tenant-owned data.

## Security Control Matrix

| Area | MVP Control | Required Evidence |
| --- | --- | --- |
| API auth | session/token validation and workspace role checks | positive and negative authorization tests |
| Repository access | tenant/workspace scope required by method signature | repository tests and code review checklist |
| Worker jobs | tenant/workspace/correlation/idempotency required in job envelope | missing-scope job fails closed |
| Event consumers | event scope/version validation before side effects | malformed event fixture tests |
| Provider credentials | encrypted at rest, never returned to clients | encryption and redaction tests |
| Support access | redacted status views and audit events | support dashboard screenshot/evidence |
| Admin actions | audit taxonomy and immutable event record | audit fixture tests |
| Source content | classification and retention policy | data classification review |
| AI input | source rights and tenant AI policy checked before provider call | policy denial test |

## Data Classification Baseline

| Data | Classification | Default Handling |
| --- | --- | --- |
| tenant/workspace ids | internal | safe as internal ids or hashes in metrics |
| user email/name | personal | not metric labels, redact from logs unless necessary |
| provider credentials/API keys | secret | encrypted, never logged, show-once only for generated secrets |
| raw source payload | source_content | retain only by policy, never send to support by default |
| normalized feed item | product_data | tenant-scoped, provenance visible |
| summary artifact | product_data_ai | cited, tenant-scoped, lineage retained |
| prompts/provider requests | sensitive_operational | not logged by default, debug capture requires explicit safe mode |
| audit events | security_record | append-only, redacted payloads |

## Delete/Export MVP Workflow

The MVP can handle export/delete manually, but the path must be explicit:

1. Authenticate requester and workspace authority.
2. Identify tenant/workspace/user/topic/source scope.
3. Classify affected data: credentials, source items, feed items, summaries, feedback, usage and audit records.
4. Apply retention exceptions for audit/security/legal records.
5. Delete, tombstone or detach raw payloads according to source policy.
6. Preserve safe citation/provenance where policy allows, or mark summaries/citations unavailable.
7. Stop queued jobs and future scans for deleted topic/source binding.
8. Record audit event with redacted payload.
9. Provide export/delete completion evidence to support/user.

Do not promise instant physical deletion for operational/audit rows that require retention; explain the limitation clearly.

## Redaction Rules

1. Redact tokens, API keys, provider credentials, OAuth refresh tokens and webhook secrets everywhere.
2. Redact raw prompt text and raw source payloads from logs/traces/crash reports by default.
3. Hash or internalize tenant/workspace identifiers in high-cardinality metrics.
4. Store correlation id and failure class instead of stack traces in user-visible errors.
5. Support views show status, provenance, failure class and safe ids, not credentials or raw payloads.

## Edge Cases

- User removed from tenant while session active.
- Support/admin accesses tenant data.
- Source credential refresh fails.
- Deletion conflicts with legal/audit retention.
- Worker receives a job with missing or stale tenant context.
- Event consumer receives tenant-owned event without tenant/workspace scope.
- Support role needs operational status but must not see raw source payloads or credentials.
- API id references another tenant but resource existence should not be revealed.
- Token revocation happens while WebSocket and workers are active.
- DSAR/deletion conflicts with summary citation/audit retention.
- Source credential is rotated while scan job is queued.
- AI provider policy changes and source rights need re-evaluation.
- User deletes topic while summary/digest jobs are queued.
- Export request includes summary citations whose raw source body is no longer retained.
- Retention exception blocks deletion of audit event but payload must stay redacted.

## Pay Attention

- Negative authorization tests are mandatory.
- No secrets in logs/traces/crashes.
- Audit events are separate from debug logs.
- Repository methods should require tenant/workspace scope by type/signature where possible.
- Background jobs must fail closed if tenant context is absent or unauthorized.
- Authorization is checked at API edge and again at worker/event side-effect boundary.
- Deletion/export workflows can start manual in MVP, but ownership and retention must be documented.

## Acceptance Criteria

- Cross-tenant access tests fail closed.
- Critical audit events recorded.
- Credentials encrypted.
- Logout/revocation works.
- API, repository, worker and event-consumer tenant isolation tests pass.
- Redaction tests cover API errors, logs, traces, crash payloads and support views.
- Data classification is recorded for every persisted table/read model.
- Manual delete/export workflow has owner, retention exceptions and audit evidence.
