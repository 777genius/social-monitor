# Frontend Architecture

## Stack

Use:

- Flutter;
- MobX;
- feature-scoped Clean Architecture;
- ports/adapters;
- presentation stores;
- generated REST client from OpenAPI;
- WebSocket realtime client;
- `flutter_headless` wrapped by `packages/design_system`.

Reference:

- flutter_headless: https://github.com/777genius/flutter_headless

## Feature Shape

```text
features/<feature>/
  domain/
  application/
  data/
  presentation/
  di/
```

Flow:

```text
Widget
-> MobX Store
-> Use Case
-> Port
-> Repository
-> REST/WebSocket client
```

Rules:

- no DTOs in widgets;
- no raw JSON in stores;
- no HTTP/WebSocket directly in widgets;
- MobX stores are presentation controllers only;
- backend owns durable truth;
- WebSocket events are notifications, REST queries fetch truth.

## Mobile Security

Flutter app must never store connector credentials, provider API keys, Reddit/X tokens, Telegram bot tokens or LLM keys.

Mobile stores only:

- short-lived access token;
- refresh token if needed;
- local UI preferences;
- bounded cached read models.

References:

- OWASP MASVS: https://mas.owasp.org/MASVS/
- flutter_secure_storage: https://pub.dev/packages/flutter_secure_storage
- OpenAPI dart-dio generator: https://openapi-generator.tech/docs/generators/dart-dio/
- MobX codegen: https://pub.dev/packages/mobx_codegen

