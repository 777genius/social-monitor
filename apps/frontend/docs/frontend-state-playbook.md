# Frontend State Management Playbook

## Purpose

This playbook gives repeatable state recipes so features do not invent new store patterns for every screen.
MobX stores are presentation controllers. Application use cases own workflow orchestration and expected failures.

## State Stack

Use this direction:

```text
Widget
-> presentation store
-> application use case
-> domain/application contract
-> infrastructure implementation
```

Stores may depend on:

- application use cases;
- domain read models/value objects;
- shared kernel state primitives;
- MobX.

Stores must not depend on generated API clients, DTOs, storage clients, routing or design-system internals.

## Common Store Fields

Prefer:

- `AsyncViewState<T>` for async data;
- `AppFailure` or typed failures for expected errors;
- `OperationGenerationGuard` for overlapping operations;
- `WorkspaceRequestGuard` for workspace or tenant changes;
- `UserActionIntent` for risky, expensive or credential-affecting actions;
- `AccessUxState` for auth/permission/credential repair states.

Avoid:

- `bool isLoading`;
- `String? error`;
- mixed raw DTO/domain/display state in one collection;
- one store that owns list, detail, form, routing, realtime and dialogs.

## Recipe: List With Filters And Selection

Use when a feature has feed items, topics, sources or summaries.

State:

- typed query/filter value object;
- `AsyncViewState<PageResult<ItemViewModel>>`;
- selected item id;
- stale marker when filters, route or workspace changes;
- `OperationGenerationGuard` per refresh/search operation.

Flow:

1. User changes filter.
2. Store creates a new operation generation.
3. Store sets loading or stale-ready state.
4. Use case returns `Result<PageResult<...>>`.
5. Store applies result only if generation and workspace are current.
6. Selection is cleared only if selected item is not in the new result and no detail route is active.

Tests:

- filter change discards late older result;
- workspace switch clears selection and data;
- empty and filtered-empty states differ;
- pagination appends without duplicate item ids.

## Recipe: Detail Screen

State:

- route/entity id as typed value;
- `AsyncViewState<DetailViewModel>`;
- permission/repair state;
- trace action ids for refresh and commands.

Flow:

- load detail by typed id;
- show stale previous detail only when same workspace and same entity id;
- show not-found/permission-required as explicit states;
- preserve parent list selection.

Tests:

- invalid id maps to not-found or bad-route state;
- permission failure maps to `AccessUxState`;
- late result for previous id is ignored.

## Recipe: Form Workflow

State:

- immutable draft model;
- field-level validation state;
- submit `AsyncViewState<CommandResult>`;
- dirty flag derived from initial draft and current draft;
- submit `UserActionIntent` with idempotency key.

Flow:

1. Draft updates synchronously.
2. Domain/value-object validation runs before submit.
3. Submit use case returns `Result`.
4. Success updates route/list state through app composition or explicit callback.
5. Dirty navigation requires confirmation.

Tests:

- invalid field blocks submit with stable reason code;
- duplicate submit reuses idempotency key or is disabled;
- dirty back behavior prompts.

## Recipe: Optimistic Update

Allowed only when rollback is clear and user harm is low.

Requirements:

- local optimistic patch has a command id;
- server result reconciles by id;
- failure rolls back or marks item as failed pending repair;
- realtime echo is deduped against command id or event id.

Do not use optimistic update for credentials, destructive actions, billing or permission changes.

## Recipe: Polling And Realtime Merge

State:

- last loaded snapshot generation;
- `RealtimeEventOrderGuard`;
- current cursor/sequence per stream;
- resync-required state.

Flow:

1. Initial REST load establishes snapshot and cursor.
2. Realtime events are accepted only for current workspace.
3. Duplicate/stale events are ignored.
4. Sequence gaps enter resync-required state.
5. Resync reloads from REST and resets guard.

Tests:

- duplicate event is ignored;
- stale event does not mutate state;
- gap requests resync;
- workspace switch clears event guard.

## Recipe: Cache Refresh

Cache defaults:

- in-memory;
- workspace-scoped;
- owner is one use case or repository implementation;
- TTL and stale behavior are explicit.

Flow:

- cache hit returns fresh ready state;
- stale hit returns stale-ready and triggers refresh;
- expired or wrong-workspace hit is ignored;
- mutation invalidates affected cache keys.

Persistent cache requires an ADR and privacy review.

