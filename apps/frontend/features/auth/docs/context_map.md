# Auth Context Map

## Owning Context

- `auth` owns session and workspace access language.

## Upstream Contexts

- Backend API provides session, tenant and workspace access data.

## Downstream Contexts

- App composition consumes only the public auth route entrypoint.
- Other features receive user/workspace state through app composition or shared kernel primitives.

## Integration Rules

- Do not import another feature package directly.
- Translate backend auth DTOs in infrastructure before they reach domain or presentation state.
