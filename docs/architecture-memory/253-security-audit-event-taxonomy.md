# 253 - Security Audit Event Taxonomy

## Decision

Security audit events use a separate taxonomy from operational logs.

Audit events are tenant-aware, immutable in normal application flows and retained according to security/compliance policy.

## Sources

- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP Logging Vocabulary: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html
- NIST SP 800-92: https://csrc.nist.gov/pubs/sp/800/92/final
- NIST SP 800-92 Rev. 1 draft: https://csrc.nist.gov/pubs/sp/800/92/r1/ipd

## Audit vs Operational Logs

Operational logs:

- debugging
- performance
- errors
- traces
- worker lifecycle

Audit events:

- who did what
- to which tenant/resource
- from where
- when
- result
- policy/security significance

Do not rely on debug logs as audit evidence.

## Required Event Fields

```text
event_id
event_type
event_version
occurred_at
actor_type
actor_id
tenant_id
resource_type
resource_id
action
outcome
reason_code
ip_hash_or_network_context
user_agent_hash_or_client_context
trace_id
metadata_redacted
```

Use UTC timestamps.

## Event Types

Required:

- user.login.succeeded
- user.login.failed
- user.logout
- session.revoked
- member.invited
- member.role_changed
- member.removed
- source.connected
- source.disconnected
- source.credential_rotated
- scan_policy.changed
- summary.generated
- api_key.created
- api_key.rotated
- api_key.revoked
- export.started
- export.completed
- support_access.granted
- support_access.used
- retention_policy.changed

## Sensitive Data Policy

Never store in audit metadata:

- raw tokens
- provider credentials
- full social post text
- raw prompts
- raw summaries if tenant policy treats them as sensitive
- passwords/secrets

Use references and hashes where needed.

## Immutability Boundary

Audit events are append-only for application code.

Correction is a new event:

```text
audit_event.corrected
```

Do not update/delete historical audit rows through normal services.

## Tamper Evidence

For higher compliance tiers, add:

- hash chain per tenant/time bucket
- object storage export
- restricted write role
- periodic digest signing
- admin review report

This is separate from normal observability logs.

## Retention

Audit retention is longer than operational log retention.

Retention may vary by plan, legal hold and compliance posture, but deleting audit events must be governed and auditable.

## Architecture Rule

If an action changes access, credentials, retention, billing, source policy or exported data, it needs an audit event.
