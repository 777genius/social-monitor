# 297 - Time Clock Timezone Policy

## Decision

Store operational timestamps in UTC using `timestamptz`.

Store user/tenant display and scheduling time zones as IANA time zone identifiers.

## Sources

- IANA Time Zone Database: https://www.iana.org/time-zones
- PostgreSQL date/time types: https://www.postgresql.org/docs/current/datatype-datetime.html
- PostgreSQL time zones: https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-TIMEZONES

## Storage Rules

Use UTC for:

- created/updated timestamps
- scan windows
- job scheduling instants
- audit events
- usage events
- summary generation timestamps
- retention deadlines

Use IANA zone ids for:

- tenant preferred timezone
- user preferred timezone
- digest delivery local time
- scheduled report local time

Example:

```text
timezone = "America/New_York"
```

Do not store ambiguous abbreviations such as `EST` as durable preference.

## Scheduling Rule

For user-local schedules, store:

- local time
- IANA timezone
- recurrence rule
- next_run_at UTC
- last_computed_with_tzdb_version when available

Recompute future runs when timezone database changes where necessary.

## DST And Ambiguity

Daylight saving transitions create:

- nonexistent local times
- repeated local times
- offset changes

Scheduling code must define behavior:

- skip impossible time
- run at next valid local time
- choose first/second occurrence for repeated time

Default behavior must be documented per schedule type.

## Clock Port

Application code depends on:

```text
ClockPort.now()
```

Do not call system clock directly in domain/use cases.

This enables deterministic tests and replay/backfill correctness.

## Provider Timestamps

Provider timestamps are normalized to UTC and raw values are preserved in raw payload/object storage when useful.

If provider timestamp is missing or malformed, record ingestion time separately.

## Architecture Rule

UTC stores instants.

IANA time zones express human scheduling intent.
