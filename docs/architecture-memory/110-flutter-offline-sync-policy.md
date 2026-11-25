# 110. Flutter Offline Sync Policy

## Status

Locked for implementation blueprint.

## Research Anchors

- Flutter offline-first support: https://docs.flutter.dev/app-architecture/design-patterns/offline-first
- Flutter state management: https://docs.flutter.dev/data-and-backend/state-mgmt/intro
- MobX code generation: https://pub.dev/documentation/mobx_codegen/latest/
- OpenAPI Generator Dart: https://openapi-generator.tech/docs/generators/dart/

## Decision

The Flutter app is not fully offline-first for all workflows. It is offline-readable for key data and online-required for high-impact mutations.

## Offline-Readable Data

Cache locally:

- current user/session shell;
- tenant/team list;
- topics list;
- source binding status;
- recent feed items;
- recent summaries/digests;
- notification preferences;
- last known usage/limits.

Do not cache raw source payloads or secrets on device.

## Mutation Policy

| Mutation | Offline behavior |
|---|---|
| create/edit topic | allow draft, sync when online |
| change scan frequency | online required |
| connect/disconnect source | online required |
| update credentials | online required |
| create notification channel | online required |
| mark item saved/read | queue offline |
| trigger backfill | online required |
| delete account/tenant data | online required with confirmation |

## Store Design

MobX presentation stores:

- expose observable view state;
- call feature use cases;
- do not call generated API clients directly;
- do not contain DTO mapping logic;
- expose explicit stale/offline/syncing/error states.

Generated OpenAPI clients live in data/adapters. Domain models stay independent.

## Sync Conflict Rules

- Server wins for entitlements, source binding state, credentials and scan policies.
- Client queued actions need idempotency keys.
- Conflicts are surfaced in UI state, not silently overwritten.
- WebSocket updates invalidate or patch cached read models.

## Best-Fact Choice

Offline-first everywhere would add too much complexity and risk for a monitoring product. Offline-readable plus carefully selected queued low-risk actions is the right initial balance.

