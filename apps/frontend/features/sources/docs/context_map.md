# Sources Context Map

## Owning Context

- `sources` owns source catalog, binding and credential health language.

## Upstream Contexts

- Backend source APIs provide catalog, binding and credential health data.

## Downstream Contexts

- Topics and feed use source effects through backend contracts, not direct feature imports.

## Integration Rules

- Keep provider-specific DTOs inside infrastructure anti-corruption code.
- Do not import topic or feed feature internals.
