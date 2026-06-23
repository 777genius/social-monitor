# Topics Feature Agent Rules

This feature is the `topics` bounded context.
Read this file before changing anything under `apps/frontend/features/topics`.

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
lib/social_monitor_topics.dart
lib/src/presentation/routes/topics_feature_route.dart
lib/src/presentation/composition/topics_feature_module.dart
lib/src/presentation/composition/topics_feature_module_host.dart
lib/src/presentation/pages/topics_feature_page.dart
```

## Bounded Context Purpose

Owns monitoring intent, topic name, backend query and topic lifecycle language.

## Growth Triggers

- create/edit/archive topic becomes a use case;
- advanced topic rules, markets, languages or monitoring intent need aggregates/value objects;
- validation, quota or policy decisions appear;
- generated API DTOs need anti-corruption mapping;
- a store spans list, editor, details or validation workflows;
- another feature needs topic ids, route contracts or topic read models.

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
