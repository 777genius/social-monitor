# 296 - Identifier UUIDv7 ID Strategy

## Decision

Use UUIDv7 as the default database identifier for new domain records where sortable, globally unique IDs are useful.

Use separate external/public identifiers only when user-facing opacity, compatibility or provider mapping requires it.

## Sources

- RFC 9562 UUIDs: https://www.rfc-editor.org/rfc/rfc9562
- RFC 9562 UUIDv7: https://www.ietf.org/rfc/rfc9562
- PostgreSQL UUID type: https://www.postgresql.org/docs/current/datatype-uuid.html

## Why UUIDv7

RFC 9562 standardizes UUIDv7 with a Unix timestamp in milliseconds in the most significant bits.

For this product, UUIDv7 gives:

- global uniqueness
- rough creation-time ordering
- better index locality than random UUIDv4
- no central sequence service
- compatibility with UUID database types

## Where To Use

Use UUIDv7 for:

- tenant id
- user id
- topic id
- source binding id
- scan job id
- normalized source item id
- summary id
- digest id
- webhook endpoint id
- audit event id
- usage event id

Provider-native ids remain provider ids and are stored separately.

## Public IDs

Public API may expose UUIDv7 directly when acceptable.

Use prefixed public IDs when UX/debugging benefits:

```text
ten_...
usr_...
top_...
src_...
sum_...
```

If prefixed IDs are used, they wrap canonical UUIDv7 values and must parse/validate consistently.

## Security Caveat

UUIDv7 includes timestamp ordering information.

Do not rely on ID unpredictability for authorization. Every object access still requires tenant/resource permission checks.

If an ID must be unguessable, use a separate random secret/token, not the primary key.

## Database Rules

Every tenant-owned table includes:

- `id uuid primary key`
- `tenant_id uuid not null`
- `created_at timestamptz not null`
- `updated_at timestamptz` where mutable

Indexes should include tenant and query access pattern, not just id.

## Idempotency Keys

Idempotency keys are separate from entity IDs.

They may be UUIDv7 or deterministic hashes depending on use case.

Do not overload entity id as idempotency key unless the command semantics guarantee one entity.

## Architecture Rule

IDs identify records.

Authorization decides access.
