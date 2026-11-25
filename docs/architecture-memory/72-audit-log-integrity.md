# Audit Log Integrity

Date: 2026-05-31
Status: baseline audit integrity memory

## Decision

Audit logs must be append-only at the application level. For high-risk audit classes, design toward tamper-evident integrity.

MVP can start with append-only Postgres tables plus restricted writes. Later, add hash chaining/Merkle anchoring or a dedicated tamper-evident store if compliance requires it.

References:

- RFC 9162 Certificate Transparency: https://www.rfc-editor.org/rfc/rfc9162.html
- immudb docs: https://docs.immudb.io/master/immudb.html
- AWS QLDB overview: https://aws.amazon.com/qldb/

## Audit Events

Audit:

```text
admin permission changes
support access grants
break-glass access
connector credential changes
source account deletion
budget changes
provider fallback changes
backfill/replay approvals
tenant export/delete
compliance deletion events
auth/session suspicious events
```

## MVP Integrity

Use:

- append-only table conventions;
- no update/delete path in application code;
- restricted DB permissions;
- audit event IDs;
- correlation/causation IDs;
- regular backup/PITR.

## Tamper-Evident Later

Options:

- hash chain per tenant/stream;
- periodic Merkle root snapshots;
- anchor roots in external storage;
- use dedicated immutable ledger/store if required.

Do not build a complex custom cryptographic audit system unless compliance need is clear.

## Required Fields

```text
audit_event_id
tenant_id
actor_id
actor_type
action
resource_type
resource_id
before_hash nullable
after_hash nullable
reason nullable
correlation_id
causation_id
occurred_at
integrity_hash later
```

## Locked Decisions

1. Audit log is append-only at application level.
2. High-risk actions are always audited.
3. Support/break-glass access is audited.
4. Tamper-evident audit is later if compliance requires it.
5. Do not overbuild custom cryptographic ledger in MVP.

