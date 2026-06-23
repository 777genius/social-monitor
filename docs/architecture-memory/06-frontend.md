# Frontend Architecture

## Status

Updated for the Flutter frontend DDD/Clean Architecture baseline.

## Stack

Use:

- Flutter;
- MobX presentation stores;
- feature-scoped DDD plus Clean Architecture;
- generated REST client from OpenAPI behind infrastructure mappers;
- realtime clients behind infrastructure realtime adapters;
- `flutter_headless` wrapped by `packages/design_system`;
- framework-neutral shared primitives in `packages/shared_kernel`.

Reference:

- frontend playbooks: `../../apps/frontend/docs/README.md`;
- frontend quality rules: `../../.claude/rules/flutter-frontend-quality.md`;
- DDD feature folders: `../../.claude/rules/ddd-clean-architecture-folders.md`;
- flutter_headless: https://github.com/777genius/flutter_headless.

## Feature Shape

```text
features/<bounded_context>/
  docs/
  lib/src/domain/
  lib/src/application/
  lib/src/infrastructure/
  lib/src/presentation/
```

`port` and `adapter` are roles, not default folder names.
Use product-language tactical folders such as `repositories`, `contracts`, `mappers`, `realtime`, `stores` and `components`.

Flow:

```text
Widget
-> MobX Store
-> Use Case
-> Domain/Application Contract
-> Infrastructure Implementation
-> REST/WebSocket client
```

Rules:

- app composition owns typed route contracts and deep-link policy;
- no DTOs in widgets or stores;
- no raw JSON in stores;
- no HTTP/WebSocket directly in widgets;
- MobX stores are presentation controllers only;
- backend owns durable truth;
- realtime events patch UI only after workspace, sequence, dedupe and schema checks.

## Frontend Security

Frontend feature code must never store connector credentials, provider API keys, Reddit/X tokens, Telegram bot tokens or LLM keys.

Allowed by default:

- local UI preferences;
- in-memory workspace-scoped read models;
- non-sensitive feature capability snapshots.

Persistent cache, secure token storage or offline provider content requires an ADR and privacy review.
