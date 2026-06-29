# Sources Context Map

## Owning Context

- `sources` owns source catalog, source profile, binding and credential health
  language.

## Upstream Contexts

- Backend source APIs provide profile, catalog, binding and credential health data.

## Downstream Contexts

- Interests and feed use source effects through backend contracts, not direct feature imports.

## Integration Rules

- Keep provider-specific DTOs inside infrastructure anti-corruption code.
- Source profile readiness and runtime readiness map unknown enum values to
  unknown/degraded frontend states, never to healthy states.
- Do not import interest or feed feature internals.
