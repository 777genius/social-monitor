# Settings Context Map

## Owning Context

- `settings` owns user preferences, workspace governance and diagnostics language.

## Upstream Contexts

- Backend account/workspace APIs provide preference and governance data.

## Downstream Contexts

- App composition may expose settings routes and diagnostics entrypoints.

## Integration Rules

- Do not let settings mutate another feature directly.
- Cross-context settings effects go through backend/API contracts or app composition.
