# 148. Tenant Export and Import Format

## Status

Locked for portability baseline.

## Research Anchors

- JSON Schema specification: https://json-schema.org/specification
- CloudEvents specification: https://github.com/cloudevents/spec

## Decision

Tenant exports use a manifest-based bundle with versioned JSON/JSONL files and optional object references. Import is conservative and never overwrites another tenant silently.

## Bundle Layout

```text
tenant-export/
  manifest.json
  tenants.json
  users.json
  memberships.json
  topics.jsonl
  topic-rules.jsonl
  source-bindings.jsonl
  scan-policies.jsonl
  summaries.jsonl
  digests.jsonl
  notification-preferences.jsonl
  audit-redacted.jsonl
```

`manifest.json` includes:

- export format version;
- tenant id;
- export time;
- data classes included;
- schema versions;
- counts and checksums;
- redaction mode;
- retention/legal notes.

## Exclusions

Default exports exclude:

- raw source payloads;
- source credentials/tokens;
- secrets/API key material;
- private provider metadata;
- high-volume telemetry;
- other tenants' shared references.

Credentials are reconnected after import, not transferred.

## Import Rules

- import into new tenant or explicit migration mode;
- validate manifest and checksums;
- remap ids;
- keep original source external ids as metadata;
- do not enqueue scans until source bindings are revalidated;
- record import audit event.

## Best-Fact Choice

Portability increases trust, but unsafe import/export can leak secrets or corrupt tenant boundaries. Use explicit manifests, redaction and revalidation.

