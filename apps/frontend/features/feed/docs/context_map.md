# Feed Context Map

## Owning Context

- `feed` owns review list and triage language.

## Upstream Contexts

- Backend feed/read API provides normalized feed data.
- Sources and topics influence feed data through backend contracts, not direct feature imports.

## Downstream Contexts

- Summaries may link to feed item ids through backend/API contracts.

## Integration Rules

- Do not import topics, sources or summaries feature packages directly.
- Map generated DTOs in infrastructure before presentation reads them.
