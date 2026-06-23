# Summaries Context Map

## Owning Context

- `summaries` owns briefing, digest and summary review language.

## Upstream Contexts

- Backend summary APIs provide generated summaries, citations and feedback state.
- Feed item ids arrive through backend/API contracts.

## Downstream Contexts

- Settings may configure summary preferences through backend contracts.

## Integration Rules

- Do not import feed or settings feature packages directly.
- Keep generated summary DTOs and provider-specific language in infrastructure.
