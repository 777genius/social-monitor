# Topics Context Map

## Owning Context

- `topics` owns monitoring intent and topic lifecycle language.

## Upstream Contexts

- Backend monitoring APIs provide topic name/query data.

## Downstream Contexts

- Sources, feed and summaries observe topic effects through backend/API contracts.

## Integration Rules

- Do not import sources, feed or summaries feature packages directly.
- Map backend topic DTOs into topic language before reaching domain or presentation.
