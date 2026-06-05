# Import, Export & Portability

Date: 2026-05-31
Status: baseline import/export memory

## Decision

Support product data import/export through canonical formats, not raw provider payloads.

## Export

Export product-owned data:

```text
topics
topic_rules
source_bindings
scan_schedules
summary_rules
digests
saved_summaries
notification_preferences
webhook_endpoints metadata
usage/cost summary
```

Exclude or restrict:

- connector credentials;
- raw provider payloads;
- internal provider metadata;
- security-sensitive audit fields;
- source content that policy forbids redistributing.

## Import

Import should support:

- topics;
- keyword/rule definitions;
- RSS feed list;
- summary rule presets;
- digest preferences.

Do not import:

- source credentials from plaintext files;
- arbitrary scripts/rules;
- unvalidated prompt templates.

## Format

Use versioned JSON export format:

```text
social_monitor_export_version
created_at
tenant_id nullable
data_sections
schema_refs
```

## Migration

Import should validate schema and produce a preview:

- items to create;
- conflicts;
- unsupported fields;
- estimated scan/cost impact.

## Locked Decisions

1. Export canonical product data, not raw provider payloads.
2. Import is schema-validated and previewed.
3. Credentials are never imported/exported as plaintext.
4. Import can estimate operational/cost impact.
5. Export format is versioned.

