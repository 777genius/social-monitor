# Flutter Clean Disk Deep Lessons

This file is the deeper forensic layer behind `flutter-frontend-quality.md`. Use it when adding or reviewing Flutter frontend code. The goal is not to shame `clean_disk`: it contains many correct architecture choices. The goal is to prevent the same scale problems from forming again.

## Evidence Summary

Measured from `/Users/belief/dev/projects/clean_disk`:

| Area | Evidence | Meaning |
|---|---:|---|
| `scan_home_page.dart` | 8438 lines, 171 top-level declarations | Route page became a feature module, widget library and formatter catalog. |
| `scan_home_page.dart` classes | 96 classes, 78 `build` methods | Too many private UI components hidden in one route file. |
| `scan_home_page.dart` state | 10 `StatefulWidget`, 10 `State` classes | Local UI state scattered through one file instead of owned subcomponents. |
| `scan_home_page.dart` store refs | 202 `store.` references | Widgets bind directly to a broad store instead of small view models. |
| `scan_home_page.dart` l10n refs | 305 `l10n.` references | Formatting and copy decisions are mixed into page composition. |
| `scan_workspace_store.dart` | 2439 lines, one main store body around 2219 lines | Presentation controller became the whole feature state machine. |
| Store dependencies | 21 use case fields | One store orchestrates too many workflows. |
| Store observables | 66 observable fields/lists/maps | UI state is too broad to reason about or rebuild precisely. |
| Store methods | 34 async methods, 36 void methods | Store became an application service plus projection engine. |
| Store notifications | 24 `_notifyChanged()` calls | Manual invalidation suggests state ownership is not granular enough. |
| `scan_home_page_test.dart` | 2758 lines, 64 `testWidgets`, 420 expectations, no groups | UI tests became one huge scenario ledger. |
| `scan_workspace_store_test.dart` | 2250 lines, 42 tests, 179 expectations, 6 fake classes | Store tests mirror store bloat instead of testing smaller collaborators. |
| `scan_models.dart` | 1227 lines, 100 top-level declarations | Domain language was correct but over-aggregated into one file. |
| `scan_protocol_dtos.dart` | 1120 lines, 52 DTO declarations | Protocol surface needs endpoint/aggregate splits or codegen ownership. |
| `scan_dto_mapper.dart` | 850 lines, 52 mapper extensions | Wire enum and aggregate mapping should be separated. |
| `app_tree_table.dart` | 897 lines, 14 declarations | Complex design-system primitive needs its own component folder. |

## Main Diagnosis

`clean_disk` had good macro-architecture:

- feature package;
- Clean Architecture layers;
- inner contracts and infrastructure implementations;
- design-system facade;
- headless wrapped by design system;
- optional Syncfusion renderer isolated in an adapter package;
- architecture boundary tests.

The debt came from missing micro-architecture budgets:

- no line budget gate;
- no responsibility budget per route file;
- no workflow budget per store;
- no split rule for domain catalogs;
- no split rule for DTO/mapper catalogs;
- no scenario split rule for tests;
- no guard for page-local private widget libraries;
- no rebuild/observer granularity budget.

Macro boundaries kept frameworks mostly in the right packages, but they did not stop a single file from absorbing too many reasons to change.

## What Was Good And Must Be Copied

Copy these patterns:

- Headless is wrapped by the design system. Feature code does not import raw `headless`.
- Syncfusion treemap is isolated as `syncfusion_disk_usage_map_adapter`, not imported by feature UI.
- Feature package has domain, application, data/infrastructure, DI and presentation zones.
- Boundary tests block raw framework and adapter imports in inner layers.
- `modularity_flutter` is isolated to route/module composition instead of leaking into domain/application/data.
- Use cases are explicit and named by user workflow.
- Value objects exist for ids, cursors, paths, sizes, events and snapshots.
- Unknown enum values exist in domain models.
- UI has keyboard shortcuts, focus handling, stable keys and responsive tests.
- Cleanup uses preview/plan/receipt concepts instead of direct deletion from UI selection.

Do not weaken these patterns while fixing the scale problems.
Do not copy literal `ports/` and `adapters/` folders as the default frontend shape. Copy the dependency direction, but use full tactical DDD folders and product-language names.
Do not copy the thin `clean_disk` `modularity_flutter` usage as-is. In this repo, every feature uses a module scope by default, but the scope is only a route/workflow boundary. It does not replace DDD folders, file budgets, workflow-scoped stores or architecture tests.

## What Went Wrong

### 1. Route Page Became A Private UI Package

`scan_home_page.dart` contains clusters that should have been separate files:

- route shell and shortcut wiring;
- cleanup confirmation dialog;
- permission repair dialog;
- first-run target chooser;
- wide workspace;
- compact workspace;
- disk usage map panel;
- disk usage map breadcrumb;
- top toolbar;
- AI assistant rail;
- metric strip;
- node table wrapper;
- details pane;
- footer and progress;
- empty/error/info banners;
- permission proof cards;
- cleanup queue preview;
- receipt summary;
- header target menu;
- breadcrumb buttons;
- path/size/progress formatting helpers.

Rule:

- A route page may own only route-level wiring and high-level layout.
- Every cluster above must live in its own file once it passes 80-120 lines or has its own callbacks/state.
- A route page with more than 12 private declarations is already drifting.
- A route page with more than 30 direct `store.` references needs view models or sub-stores.

Recommended split:

```text
presentation/pages/scan_home_page.dart
presentation/layout/scan_workspace_view.dart
presentation/layout/scan_wide_workspace.dart
presentation/layout/scan_compact_workspace.dart
presentation/toolbar/scan_top_bar.dart
presentation/target/scan_target_menu.dart
presentation/tree/scan_node_table.dart
presentation/details/scan_details_pane.dart
presentation/cleanup/cleanup_queue_panel.dart
presentation/cleanup/cleanup_confirm_dialog.dart
presentation/permission/permission_proof_card.dart
presentation/footer/scan_footer.dart
presentation/formatters/scan_display_formatters.dart
presentation/view_models/scan_*_view_model.dart
```

### 2. Store Became A Multi-Workflow Application Service

`ScanWorkspaceStore` owns all of these:

- target picker and recent target persistence;
- daemon compatibility and capability probing;
- permission probing and repair launch;
- scan start/cancel/dispose;
- status polling and readable snapshot wait;
- tree root and child paging;
- search and top items;
- partial/growing tree projection;
- disk usage map projection;
- node selection and details loading;
- cleanup queue, plan, execution, receipt and recovery inbox;
- realtime stream subscription and event reconciliation;
- stale snapshot and event ordering;
- manual change notifications.

Rule:

- One store owns one cohesive user workflow.
- More than 8 use case dependencies in one store is a split trigger.
- More than 20 observable fields is a split trigger.
- More than 12 public actions is a split trigger.
- Manual notification methods are a smell unless they bridge a non-reactive API.

Recommended split:

```text
presentation/stores/workspace_session_store.dart
presentation/stores/target_selection_store.dart
presentation/stores/permission_status_store.dart
presentation/stores/scan_query_store.dart
presentation/stores/tree_projection_store.dart
presentation/stores/disk_map_store.dart
presentation/stores/node_selection_store.dart
presentation/stores/cleanup_queue_store.dart
presentation/stores/realtime_scan_events_store.dart
presentation/stores/scan_workspace_coordinator.dart
```

Coordinator rules:

- It wires stores and cross-workflow reactions.
- It does not hold every observable.
- It does not call every use case directly.
- It can expose a compact facade to the route page.

### 3. Store State Was Too Boolean And Too Wide

The store has many independent flags and nullable fields:

- loading flags;
- failure fields;
- selected ids;
- active snapshot ids;
- focus ids;
- map rows;
- tree rows;
- partial rows;
- cleanup plan and receipt.

Rule:

- Use typed state objects, not scattered booleans.
- Prefer `AsyncValue<T>` or feature-specific sealed state for each async surface.
- Each async state carries generation/scope when stale results are possible.
- A store should expose immutable snapshots to widgets where possible.

Good pattern:

```dart
sealed class QueryState<T> {
  const QueryState();
}

final class QueryIdle<T> extends QueryState<T> {}
final class QueryLoading<T> extends QueryState<T> {
  const QueryLoading({required this.generation});
  final int generation;
}
final class QueryReady<T> extends QueryState<T> {
  const QueryReady({required this.value, required this.generation});
  final T value;
  final int generation;
}
final class QueryFailed<T> extends QueryState<T> {
  const QueryFailed({required this.failure, required this.generation});
  final AppFailure failure;
  final int generation;
}
```

### 4. Domain Was Correct But Over-Colocated

`scan_models.dart` has 100 declarations across many conceptual families:

- protocol version and ids;
- scan targets and target policies;
- session state and progress;
- node/page/query models;
- path privacy and issues;
- partial/growing tree models;
- cleanup queue/plan/receipt/recovery;
- scan events and event envelopes;
- capabilities, runtime proof, diagnostics.

Rule:

- Domain barrels should be curated, but implementation files should be split by aggregate family.
- Keep related invariants together; do not create one `models.dart` dump.
- Public export files can preserve ergonomic imports.

Recommended split:

```text
domain/identity.dart
domain/scan_target.dart
domain/session.dart
domain/node_page.dart
domain/node_details.dart
domain/issues.dart
domain/growing_tree.dart
domain/cleanup_plan.dart
domain/cleanup_receipt.dart
domain/scan_events.dart
domain/capabilities.dart
domain/diagnostics.dart
```

### 5. DTOs And Mappers Became Protocol Dumps

`scan_protocol_dtos.dart` and `scan_dto_mapper.dart` collected the whole daemon protocol:

- command request DTOs;
- query request DTOs;
- page response DTOs;
- event DTOs;
- cleanup DTOs;
- capability DTOs;
- diagnostics DTOs;
- all wire enum mapping in one `StringDomainMapper`.

Rule:

- DTOs split by endpoint group or OpenAPI tag.
- Mappers split in the same shape as DTOs.
- Wire enum mapping lives next to the enum family it maps.
- Unknown/future enum behavior must be tested in the mapper file for that family.

Recommended split:

```text
infrastructure/dto/scan_command_dtos.dart
infrastructure/dto/scan_query_dtos.dart
infrastructure/dto/node_dtos.dart
infrastructure/dto/cleanup_dtos.dart
infrastructure/dto/event_dtos.dart
infrastructure/dto/capability_dtos.dart
infrastructure/mappers/scan_command_mapper.dart
infrastructure/mappers/node_mapper.dart
infrastructure/mappers/cleanup_mapper.dart
infrastructure/mappers/event_mapper.dart
infrastructure/mappers/capability_mapper.dart
infrastructure/mappers/wire_enum_mapper.dart
```

### 6. Design-System Primitive Grew Into A Mini Framework

`app_tree_table.dart` is not a bad component. It has good responsibilities:

- stable row keys;
- lazy `ListView.builder`;
- keyboard shortcuts;
- focus management;
- semantics;
- row expansion;
- status pills;
- header;
- row tile rendering.

The problem is colocation.

Rule:

- Any design-system primitive above 250 lines becomes a folder.
- Keep public component API in one file.
- Move controller/focus logic, row models, header, row tile, semantics helpers and tests into sibling files.

Recommended split:

```text
components/tree_table/app_tree_table.dart
components/tree_table/tree_table_models.dart
components/tree_table/tree_table_controller.dart
components/tree_table/tree_table_shortcuts.dart
components/tree_table/tree_table_header.dart
components/tree_table/tree_table_row_tile.dart
components/tree_table/tree_table_semantics.dart
components/tree_table/tree_table_tokens.dart
```

### 7. Tests Mirrored The Monoliths

`scan_home_page_test.dart` has 64 widget tests and no groups. That makes it hard to know which workflow broke.

Bad symptoms:

- one huge widget test file;
- many unrelated expectations in the same file;
- large shared pump helper hidden in the file;
- no workflow grouping;
- fake classes and fixture builders inside scenario files;
- hard to run only cleanup, target menu, tree, details or footer tests.

Rule:

- Test files obey the same 600-line hard limit.
- One workflow per test file.
- Shared pump/builders go to `test/support/`.
- Fakes go to `test/fakes/`.
- Fixture data goes to `test/fixtures/`.

Recommended split:

```text
test/presentation/scan_workspace_shell_test.dart
test/presentation/scan_target_menu_test.dart
test/presentation/scan_tree_table_test.dart
test/presentation/scan_details_pane_test.dart
test/presentation/scan_disk_map_test.dart
test/presentation/scan_cleanup_flow_test.dart
test/presentation/scan_permission_flow_test.dart
test/presentation/scan_footer_test.dart
test/support/pump_scan_workspace.dart
test/support/scan_test_data.dart
test/fakes/fake_scan_store.dart
```

Store tests should split by store after the store split:

```text
test/stores/target_selection_store_test.dart
test/stores/scan_query_store_test.dart
test/stores/tree_projection_store_test.dart
test/stores/cleanup_queue_store_test.dart
test/stores/realtime_scan_events_store_test.dart
```

## Red Flags Agents Must Catch Early

Stop before adding code when any of these is true:

- target Dart file is over 500 lines;
- route page already has more than 12 private classes;
- route page would need a new private formatter/helper section;
- route page directly reads more than one store workflow;
- store constructor needs more than 8 use cases;
- store has more than 20 observables;
- store method both calls a use case and formats UI text;
- store method mutates unrelated workflow state;
- widget test file would pass 500 lines;
- mapper file would include a new endpoint family;
- model file would include a new aggregate family;
- design-system component needs feature-specific imports;
- feature widget needs raw `headless`, charting, renderer or generated API imports.

## Social Monitor Mapping

For this repo, avoid a future `feed_home_page.dart` or `monitoring_workspace_store.dart` becoming the new `scan_home_page.dart`.

Split early by product workflow:

```text
features/feed/
  presentation/pages/feed_page.dart
  presentation/layout/feed_workspace.dart
  presentation/filters/feed_filter_bar.dart
  presentation/list/mention_list.dart
  presentation/details/mention_details_pane.dart
  presentation/stores/feed_query_store.dart
  presentation/stores/feed_selection_store.dart
  presentation/stores/feed_realtime_store.dart

features/topics/
  presentation/pages/topics_page.dart
  presentation/list/topic_list.dart
  presentation/editor/topic_rule_editor.dart
  presentation/stores/topic_list_store.dart
  presentation/stores/topic_editor_store.dart

features/summaries/
  presentation/pages/summaries_page.dart
  presentation/list/summary_list.dart
  presentation/details/summary_details.dart
  presentation/stores/summary_query_store.dart
  presentation/stores/summary_generation_store.dart
```

Do not create:

```text
social_monitor_workspace_page.dart
social_monitor_workspace_store.dart
social_monitor_models.dart
social_monitor_dtos.dart
social_monitor_mapper.dart
```

Those names are too broad and invite the exact `clean_disk` failure mode.

## Hard Review Questions

Before accepting Flutter code, ask:

1. What is the one reason this file changes?
2. What will happen when the feature gets twice as many states?
3. Can I run a focused test for just this workflow?
4. Can a new agent find the relevant code in under 60 seconds?
5. Does this screen rebuild more than necessary when one observable changes?
6. Is this DTO/domain/view-model boundary explicit?
7. Would adding another action require editing a 1000-line page or store?
8. Are responsive states designed, not patched after overflow?
9. Can the design-system component be reused without feature imports?
10. Is the current split still good if mobile ships next?

If any answer is weak, split or add a boundary before adding behavior.

## Deep Quality Scores From Clean Disk

Scores are for the observed frontend implementation, not the product idea:

| Criterion | Score /10 | Why |
|---|---:|---|
| Macro architecture | 8 | Feature packages, inner contracts, infrastructure implementations, design system and headless boundary are strong. |
| Module boundary usage | 6 | `modularity_flutter` was isolated correctly, but it mostly wrapped route-scoped store/config lookup and did not improve decomposition. Use it as a required boundary, not as a substitute for splitting pages, stores and domain language. |
| Micro architecture | 4 | Page/store/model/mapper/test files became too large. |
| Dependency direction | 7 | Import boundaries are mostly guarded, but size/complexity were not. |
| Presentation maintainability | 3 | 8438-line page is not reviewable. |
| Store maintainability | 3 | 21 use cases and 66 observable fields in one store. |
| Domain expressiveness | 8 | Domain concepts are rich and typed. |
| Domain organization | 5 | Too many domain families in one file. |
| DTO boundary | 6 | DTOs are separated from UI, but protocol files are too broad. |
| Design-system direction | 8 | Headless facade and renderer adapter are correct. |
| Design-system granularity | 6 | Tree table should be a component folder. |
| Responsive intent | 7 | Wide/compact behavior exists and is tested. |
| Responsive maintainability | 5 | Too much responsive layout lives in one page file. |
| Test coverage intent | 8 | Many important states are tested. |
| Test maintainability | 4 | Test files are too large and not grouped by workflow. |
| Future refactor cost | 3 | Splitting after 8k/2k-line files is much more expensive than early boundaries. |

## The Rule Of Three Splits

When a feature starts growing, split in this order:

1. Split presentation by visible surface.
2. Split store by workflow.
3. Split domain/DTO/mappers by aggregate or endpoint family.

Do not start by extracting random helpers. Random helper extraction reduces line count but keeps ownership unclear.

Good split names are product-language names:

- `TopicRuleEditor`
- `MentionDetailsPane`
- `FeedFilterBar`
- `SummaryGenerationStore`
- `SourceCredentialHealthStore`

Weak split names are vague:

- `helpers.dart`
- `utils.dart`
- `widgets.dart`
- `models.dart`
- `manager.dart`
- `controller.dart` without workflow name.

## Practical Enforcement Ideas

Add or keep checks for:

- human Dart file line budget, excluding generated files;
- feature import matrix;
- no raw headless imports outside design system;
- no generated API imports outside infrastructure;
- no feature-to-feature private imports;
- no design-system imports from app/features;
- route page private declaration count;
- store use case dependency count;
- store observable count;
- test file line budget;
- TODO/FIXME count in frontend packages.

These checks should fail early, before a review has to argue taste.
