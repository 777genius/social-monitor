# 214. Object Storage Layout and Lifecycle

## Status

Locked for storage baseline.

## Research Anchors

- S3 object keys: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
- S3 lifecycle configuration: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
- S3 Object Lock: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html

## Decision

Use structured object keys with tenant/date/class prefixes and lifecycle rules by data class. Database records remain the authoritative index.

## Key Layout

```text
raw-payloads/tenant=<tenant_id>/source=<source_kind>/yyyy/mm/dd/<payload_id>.json
artifacts/tenant=<tenant_id>/type=summary/yyyy/mm/dd/<artifact_id>.json
media-quarantine/tenant=<tenant_id>/yyyy/mm/dd/<object_id>
exports/tenant=<tenant_id>/yyyy/mm/dd/<export_id>/
```

## Rules

- Generate object ids server-side.
- Store object metadata in Postgres.
- Do not expose raw bucket keys directly to clients unless via scoped signed URL.
- Lifecycle policies follow data class retention.
- Legal hold/Object Lock only for explicitly held data.
- Encrypt objects at rest.
- Keep raw payload and derived artifact buckets/prefixes separable.

## Best-Fact Choice

Object storage is cheap but easy to lose control of. Prefixes, metadata records and lifecycle rules must mirror data classification.

