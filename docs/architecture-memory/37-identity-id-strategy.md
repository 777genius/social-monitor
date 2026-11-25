# Identity & ID Strategy

Date: 2026-05-31
Status: baseline ID strategy memory

## Decision

Use UUIDv7 for internal product IDs where possible.

Use external/natural IDs only as source-specific identifiers, not primary product IDs.

Reference:

- RFC 9562 UUIDs: https://www.ietf.org/rfc/rfc9562

## Why UUIDv7

UUIDv7 is time-ordered and based on Unix timestamp milliseconds in the most significant bits. This gives better database index locality than random UUIDv4 while staying decentralized.

Use UUIDv7 for:

```text
tenant_id
user_id
topic_id
source_binding_id
scan_run_id
connector_run_id
source_item_id
summary_job_id
summary_id
digest_id
outbox_event_id
audit_event_id
```

## External IDs

Keep external IDs separately:

```text
reddit post id
hn item id
x post id
telegram update id
activitypub object id
atproto uri/cid
matrix event id
rss guid
canonical url
```

## Source Item Identity

Canonical source item identity:

```text
source_item_id = UUIDv7 internal id
external_identity_key = hash(source_type + source_instance + external_id)
```

Fallback identity for weak sources:

```text
fallback_identity_key = hash(
  canonical_url +
  normalized_author +
  normalized_timestamp +
  normalized_text_fingerprint
)
```

## Rules

- Do not expose database sequence IDs publicly.
- Do not use external source IDs as internal primary keys.
- Do not key UI state by row index/display text.
- Stable IDs are required for virtualization, pagination and event replay.

## Locked Decisions

1. UUIDv7 is preferred for internal generated IDs.
2. External source IDs are stored separately.
3. Source identity keys are deterministic and unique per source/source instance.
4. UI and events use stable product IDs.
5. Weak-source fallback IDs are explicit, not hidden.

