# Feed Feature Agent Rules

This feature is the `feed` bounded context.
Read this file before changing anything under `apps/frontend/features/feed`.

## Required Reading

- Root project rules: `../../../../AGENTS.md`
- DDD feature standard: `../../../../.claude/rules/ddd-clean-architecture-folders.md`
- Frontend quality rules: `../../../../.claude/rules/flutter-frontend-quality.md`
- Clean Disk lessons: `../../../../.claude/rules/flutter-clean-disk-deep-lessons.md`
- Frontend playbooks: `../../docs/README.md`

## Current Mode

Mode: canonical modular DDD bounded context.

Required scaffold files:

```text
AGENTS.md
docs/ubiquitous_language.md
docs/context_map.md
lib/social_monitor_feed.dart
lib/src/presentation/routes/feed_feature_route.dart
lib/src/presentation/composition/feed_feature_module.dart
lib/src/presentation/composition/feed_feature_module_host.dart
lib/src/presentation/pages/feed_feature_page.dart
```

## Bounded Context Purpose

Owns mention review, triage, filtering, evidence preview, provenance and feed reading language.

## Growth Triggers

- feed filtering or triage becomes a use case;
- mention/feed item concepts need entities, value objects or aggregates;
- source payload DTOs need anti-corruption mapping;
- pagination, cache, realtime updates or stale state appears;
- store state spans selection, filters, details or refresh workflows;
- another feature needs a feed item id, route contract or read model.

When growing, use the tactical folders from the shared DDD standard. Do not create `ports/`, `adapters/`, `models.dart`, `utils.dart` or layer-root Dart files.

## Feature Growth Rules

- Use typed shared async state and typed failures instead of loose `isLoading`/`error` fields.
- Guard async/realtime updates against stale workspace, filter, route or selection state before mutating stores.
- Keep generated DTOs and provider payload language inside infrastructure mappers or anti-corruption folders.
- Keep risky actions explicit with action id, risk, disabled reason, confirmation policy and idempotency key.
- Do not add raw route paths, direct environment flag reads, persistent cache packages or console logging in feature code.
- Realtime input needs event id, schema version, cursor, sequence, workspace scope and order guarding.
- Cache is in-memory by default and scoped to workspace unless an ADR approves persistence.
- Keep fixtures in `test/support` and do not store realistic tokens, API keys, secrets or raw provider payloads.

## Local Done Checks

- From `apps/frontend`, run `fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart`.
- Run `fvm flutter analyze` for Dart changes.
- Add focused tests for any use case, mapper, store or value object introduced here.
