# Object Storage & Raw Payloads

Date: 2026-05-31
Status: baseline raw payload memory

## Decision

Store large/raw source payloads in S3-compatible object storage, not directly in core Postgres rows.

Postgres stores:

```text
raw_payload_ref
content_hash
source_type
provider
tenant_id
source_item_id
discovered_at
retention_until
legal_hold
encryption_metadata
```

Object storage stores:

```text
raw provider response
HTML/JSON payload
large transcript/comment snapshots where allowed
debug artifacts where allowed
```

## Raw Payload Rules

1. Raw payload retention is short by default.
2. Raw payload retention is source-policy-specific.
3. Raw payloads are not exported blindly to users.
4. Raw payloads are not rendered in UI without sanitization.
5. Raw payloads are not used as canonical product truth.

## Object Lifecycle

Use object lifecycle rules for expiry and transitions.

MinIO supports time/date based automatic transition or expiry of objects. AWS S3 lifecycle/Object Lock can support retention/legal hold patterns when using AWS.

References:

- MinIO Object Lifecycle Management: https://min.io/docs/minio/windows/administration/object-management/object-lifecycle-management.html
- AWS S3 Object Lock: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html

## Legal Hold

Legal hold must be explicit in metadata and operations.

Use cases:

- enterprise legal hold;
- security investigation;
- billing/audit dispute;
- compliance investigation.

Rule:

```text
Legal hold blocks purge but does not grant broad access.
```

## Encryption

Object storage payloads must be encrypted at rest. Connector credentials must never be stored in object payloads.

Metadata must track:

```text
kms_key_id
encryption_context
created_by_connector_run_id
retention_until
purge_status
```

## Locked Decisions

1. Raw payloads go to S3-compatible storage, not core product rows.
2. Postgres stores references and metadata.
3. Raw payload retention is short and policy-specific.
4. Legal hold must be modeled explicitly.
5. Raw payloads are debug/compliance artifacts, not durable product truth.

