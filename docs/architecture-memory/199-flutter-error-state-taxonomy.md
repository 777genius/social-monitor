# 199. Flutter Error State Taxonomy

## Status

Locked for Flutter UX baseline.

## Research Anchors

- Flutter error handling: https://docs.flutter.dev/testing/errors
- Flutter Result pattern: https://docs.flutter.dev/app-architecture/design-patterns/result
- Flutter common errors: https://docs.flutter.dev/testing/common-errors

## Decision

Frontend errors must be typed and recoverable. MobX stores expose error state categories, not raw exceptions or backend strings.

## Error Categories

| Category | User Treatment |
|---|---|
| validation | inline field error |
| auth_expired | sign-in/reauth flow |
| forbidden | permission state |
| not_found | stable missing-resource screen |
| offline | offline banner + cached data |
| stale | stale indicator + refresh |
| rate_limited | wait/retry message |
| plan_limit | upgrade/limit explanation |
| source_attention | source setup/credential CTA |
| provider_unavailable | degraded state |
| server_error | retry + report id |
| unknown | generic fallback + report id |

## Store Rules

- Use Result-style returns in data/application layers.
- Map API Problem Details codes to domain/presentation failures.
- Stores expose `loading`, `empty`, `data`, `error`, `stale`, `offline`, `syncing`.
- UI never renders raw stack traces or provider errors.
- Crash/error reporting redacts tenant/source content.

## Best-Fact Choice

Good error taxonomy is product design. Monitoring apps live in degraded states often; the UI must explain and recover rather than just fail.

