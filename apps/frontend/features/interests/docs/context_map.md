# Interests Context Map

## Owning Context

- `interests` owns monitoring intent and interest lifecycle language.

## Upstream Contexts

- Backend monitoring APIs provide interest name/query data.

## Downstream Contexts

- Sources, feed and summaries observe interest effects through backend/API contracts.

## Integration Rules

- Do not import sources, feed or summaries feature packages directly.
- Map backend interest DTOs into interest language before reaching domain or presentation.
