# Flutter Adaptive Tooling Research 2026

## Status

Researched on 2026-06-22 for the web-first Flutter frontend that must also work well as a mobile app.

This document is a tooling and architecture decision input for `apps/frontend`.

Research inputs:

- official Flutter adaptive/responsive documentation
- official Flutter architecture and performance documentation
- `pub.dev` API metadata for package version, release date, SDK constraints, likes and score, checked on 2026-06-22
- existing Social Monitor frontend architecture memory

The Tavily research run failed with an MCP session header error, so it is excluded from evidence.

## Executive Decision

Build adaptive UI with a constraints-first internal design system.

Use Flutter's built-in layout primitives as the foundation:

- `LayoutBuilder`
- `MediaQuery.sizeOf`
- slivers and lazy lists
- `Flex`, `Expanded`, `Flexible`, `Wrap`, `GridView`, `CustomScrollView`
- Material 3 theming through `ThemeData`, `ColorScheme` and product tokens

Add first-party adaptive primitives inside `social_monitor_design_system`:

- `AppBreakpoints`
- `AppScreenClass`
- `AppAdaptiveBuilder`
- `AppAdaptiveShell`
- `AppAdaptiveNavigation`
- `AppPaneLayout`
- `AppListDetailLayout`
- `AppResponsiveGrid`
- `AppMaxWidth`

Do not start with a global responsive package or screen-scaling package.

Keep this boundary:

```text
feature screen
  -> design_system adaptive primitives
  -> headless behavior adapters
  -> Flutter layout primitives
  -> MobX presentation store
```

Feature packages should not import raw adaptive/layout helper packages directly. If a package is added later, it should be hidden behind `design_system`.

## Why This Is The Best Fit

Social Monitor is an operational product, not a brochure site. The UI needs dense lists, filters, source health, alerts, dashboards, inbox-style review, detail panels and admin flows.

That pushes the architecture toward:

- predictable navigation
- master/detail layouts
- resilient data-dense views
- keyboard and pointer support on desktop
- touch-first controls on mobile
- independent scroll regions only when they are intentional
- local state rebuilds, not whole-screen redraws

Global viewport scaling solves the wrong problem. It can make a mockup proportionally fit, but it does not decide whether a feed should become master/detail, whether filters should move into a sheet, whether a side panel should collapse, or whether a table should become a card list.

## Official Flutter Guidance Applied

Flutter's current guidance separates responsive and adaptive design:

- responsive UI fits available space
- adaptive UI changes layout and interaction choices for the available space

The official flow is:

1. Abstract the layout pattern.
2. Measure available space.
3. Branch into the right layout.

Use `MediaQuery.sizeOf(context)` when the decision depends on the whole window. Use `LayoutBuilder` when the decision depends on the parent constraints of a local component.

Breakpoints should be based on available width and content behavior, not on device type. A desktop window can be narrow. A tablet can be wide. A phone can rotate. A browser can be resized.

Do not lock orientation as a substitute for responsive design.

Break large widgets into smaller widgets and localize state changes. Avoid expensive work inside `build`, and avoid broad rebuilds for high-frequency updates like realtime feeds.

## Product Breakpoints

Use these as initial product defaults, then tune by golden tests and real screens.

| Screen class | Width | Primary layout | Navigation | Typical use |
| --- | ---: | --- | --- | --- |
| `compact` | `< 600` | single column | bottom nav or drawer | phone, narrow browser |
| `medium` | `600-839` | single column with wider content, selective two-pane | nav rail or drawer | tablet portrait, small window |
| `expanded` | `840-1199` | master/detail, rail/sidebar | rail or compact sidebar | tablet landscape, laptop window |
| `wide` | `>= 1200` | sidebar plus content plus optional detail panel | persistent sidebar | desktop, operations dashboard |
| `ultraWide` | `>= 1600` | constrained content plus extra context panes | persistent sidebar | monitoring wall, large desktop |

The values are not a religion. The rule is: branch when the content pattern breaks, not when a device label changes.

## Top 3 Strategy Options

1. Internal design-system adaptive primitives over core Flutter - 🎯 10   🛡️ 9   🧠 6

   Best default for this project. It gives strict architecture boundaries, avoids package lock-in, works for web and mobile, and fits the existing `flutter_headless` wrapper strategy.

   Estimated change size: 600-1200 LOC for the first strong version, including tests.

2. `flutter_adaptive_scaffold` behind `design_system` adapters - 🎯 8   🛡️ 8   🧠 4

   Good if we want a fast Material-style adaptive shell with navigation elements. It is maintained in the official Flutter packages repository and fits Flutter's adaptive model.

   Estimated change size: 200-500 LOC if used only for shell/navigation adapters.

3. Global responsive/scaling packages as the primary system - 🎯 5   🛡️ 5   🧠 4

   Fast to wire, but risky for a serious operational app. These packages can help in narrow cases, but they should not own product layout decisions.

   Estimated change size: 100-300 LOC initially, with higher future migration cost if layout semantics are wrong.

## Headless Ecosystem Extraction Strategy

Do not publish a separate `headless_adaptive` package immediately.

The best path is to build the first adaptive primitives inside `social_monitor_design_system`, keep their API generic, and extract only after the API survives real Social Monitor screens.

1. Keep adaptive primitives in `design_system` now, extract generic pieces later - 🎯 9   🛡️ 9   🧠 5

   Best current choice. It protects product velocity and avoids designing a public API before we know the real screen patterns.

   Estimated change size: 400-900 LOC now. Later extraction: 300-700 LOC if the API stays clean.

2. Create a local `packages/adaptive_layout` package inside `apps/frontend` now - 🎯 7   🛡️ 7   🧠 6

   Acceptable if `design_system` starts becoming too broad. It still keeps the code product-local and avoids public ecosystem pressure.

   Estimated change size: 500-1000 LOC.

3. Create a public `headless_adaptive` package in the Headless ecosystem now - 🎯 6   🛡️ 6   🧠 8

   Strategically interesting, but too early. A public package needs stable naming, docs, examples, tests, semantic versioning and a generic API that is not contaminated by Social Monitor assumptions.

   Estimated change size: 900-1800 LOC plus ongoing maintenance.

Extraction criteria:

- at least 3 real product screens use the same adaptive primitives
- no Social Monitor names, tokens, routes or feature concepts in the candidate API
- API works without MobX, generated API clients or product navigation
- tests cover compact, medium, expanded and wide widths
- examples show shell, list/detail and responsive grid
- package has clear boundaries with `headless` component behavior

Candidate extractable pieces:

- `AdaptiveBreakpoint`
- `AdaptiveScreenClass`
- `AdaptiveBuilder`
- `AdaptiveValue<T>`
- `AdaptiveSlotLayout`
- generic list/detail layout primitives

Keep product-local:

- Social Monitor breakpoint values until proven generic
- product navigation destinations
- app shell visuals
- source/feed/topic/summaries layout decisions
- design tokens and component styling

## Package Matrix

| Area | Package | Current version checked | Evidence | Recommendation |
| --- | --- | ---: | --- | --- |
| Core adaptive layout | Flutter built-ins | Flutter `3.41.9` in frontend `.fvmrc` | official docs | Use as primary system. |
| Adaptive shell | `flutter_adaptive_scaffold` | `0.3.3+1`, 2025-05-06, 150/160 | official Flutter packages repo | Optional behind `design_system` if shell speed matters. |
| Global responsive wrapper | `responsive_framework` | `1.5.1`, 2024-08-26, 150/160 | mature and popular | Do not use as core. Consider only for page-like web layouts. |
| Responsive builder helpers | `responsive_builder` | `0.7.1`, 2024-07-03, 150/160 | simple helper package | Not needed unless we want a small wrapper API. |
| Screen scaling | `flutter_screenutil` | `5.9.3`, 2024-05-31, 150/160 | very popular | Avoid as primary. Use only for controlled proportional scaling if proven necessary. |
| Screen scaling | `sizer` | `3.1.3`, 2025-08-26, 150/160 | active | Avoid as primary for same reason as ScreenUtil. |
| Grid layout | `flutter_layout_grid` | `2.0.8`, 2025-04-15, 160/160 | CSS-like grid | Good optional dependency for complex responsive grids. Not needed for initial shell. |
| Routing | `go_router` | `17.3.0`, 2026-06-02, 150/160 | official Flutter packages repo | Keep. Use `ShellRoute` for adaptive app shell and deep links. |
| State/rebuilds | `mobx` | `2.6.0`, 2026-01-03, 160/160 | mature | Keep for presentation stores. |
| State/rebuilds | `flutter_mobx` | `2.3.0`, 2024-12-16, 160/160 | mature | Keep, but keep observers narrow. |
| Alternative state | `flutter_riverpod` | `3.3.2`, 2026-06-10, 140/160 | strong ecosystem | Do not mix in now. Adds architecture churn. |
| Alternative state | `flutter_bloc` | `9.1.1`, 2025-05-02, 160/160 | strong ecosystem | Do not mix in now. MobX is already locked. |
| Data table | `data_table_2` | `2.7.2`, 2025-11-28, 160/160 | sticky headers and better DataTable ergonomics | Good first option for admin tables behind a DS adapter. |
| 2D scrolling | `two_dimensional_scrollables` | `0.5.2`, 2026-05-12, 150/160 | official Flutter packages repo | Good for custom large grids or calendar-like surfaces. |
| Rich data grid | `pluto_grid` | `8.1.0`, 2025-12-12, 160/160 | spreadsheet-like grid | Use only behind adapter if editing/grid keyboard workflows become core. |
| Enterprise data grid | `syncfusion_flutter_datagrid` | `33.2.13+1`, 2026-06-18, 150/160 | rich and current | Strong capability, but license and vendor coupling must be reviewed first. |
| Desktop window | `window_manager` | `0.5.1`, 2025-07-12, 160/160 | mature desktop window API | Add only when packaging desktop builds. Not needed for web/mobile. |
| Multi-window | `desktop_multi_window` | `0.3.0`, 2025-10-28, 150/160 | niche desktop capability | Defer. Only useful for real desktop app workflows. |
| Custom titlebar | `bitsdojo_window` | `0.1.6`, 2023-12-23, 120/160 | older release | Avoid for now. |
| Split panes | `multi_split_view` | `3.6.2`, 2026-05-24, 160/160 | active | Good optional adapter for desktop resizable panels. |
| Split panes | `split_view` | `3.2.2`, 2026-02-16, 160/160 | active but smaller | Prefer `multi_split_view` if we need this category. |
| Platform UI | `fluent_ui` | `4.15.1`, 2026-03-27, 145/160 | Windows-style UI | Avoid as core. Social Monitor should be product-consistent, not OS-split. |
| Platform UI | `macos_ui` | `2.2.2`, 2025-10-19, 160/160 | macOS-style UI | Avoid as core. Use only for a deliberate native desktop product. |
| Platform UI | `yaru` | `10.2.0`, 2026-06-08, 150/160 | Ubuntu-style UI | Avoid as core. |
| Platform abstraction | `flutter_platform_widgets` | `10.0.1`, 2026-01-14, 135/160 | platform switching | Avoid as core. It conflicts with product design-system ownership. |
| Golden tests | `alchemist` | `0.14.0`, 2026-03-13, 160/160 | current | Preferred golden testing candidate once compatible with local SDK. |
| Golden tests | `golden_toolkit` | `0.15.0`, 2023-02-21, 150/160 | older SDK constraint | Avoid as new choice unless forced by existing tests. |
| Device preview | `device_preview` | `1.3.1`, 2025-06-30, 140/160 | useful dev preview | Good dev-only candidate after SDK compatibility check. |
| Component workbench | `widgetbook` | `3.24.0`, 2026-06-08, 160/160 | excellent isolation workflow | Good later, but current package requires Flutter `>=3.44.0`; frontend is on `3.41.9`. |
| Headless components | `headless` | `1.1.0`, 2026-05-04, 150/160 | required by existing architecture | Keep wrapped through `design_system`. |

## Recommended Stack For Social Monitor

Before adding any new package from this document, recheck `pub.dev` for the latest stable version, SDK constraints and license status.

### Now

Use no new adaptive dependency yet.

Implement inside `social_monitor_design_system`:

- `AppBreakpoints`
- `AppScreenClass`
- `AppAdaptiveBuilder`
- `AppAdaptiveShell`
- `AppAdaptiveNavigation`
- `AppPaneLayout`
- `AppResponsiveGrid`
- `AppMaxWidth`

Keep:

- `go_router` for URL-first navigation and shell routes
- `mobx` and `flutter_mobx` for presentation state
- `headless` only through design-system adapters
- generated API clients isolated under data adapters

### Near Term

Evaluate package additions only when a screen proves the need:

- `flutter_adaptive_scaffold` if shell/navigation is mostly Material adaptive shell
- `data_table_2` if admin tables need sticky headers and better desktop behavior
- `multi_split_view` if analysts need user-resizable panes
- `flutter_layout_grid` if dashboards need CSS-like grid placement
- `alchemist` for golden tests after SDK compatibility check

### Later

Defer until there is a real product reason:

- `window_manager` for packaged desktop builds
- `two_dimensional_scrollables` for large custom two-dimensional surfaces
- `pluto_grid` for spreadsheet-style editing
- `syncfusion_flutter_datagrid` for enterprise grids after license review
- `widgetbook` after upgrading Flutter to at least `3.44.0`

## Layout Playbook

### Compact

Use:

- one primary column
- touch-first controls
- sheets for filters and secondary panels
- bottom navigation only for a small number of primary destinations
- compact cards/list rows instead of wide tables
- no hover-only actions

Avoid:

- permanent sidebars
- multi-column dashboards
- wide filter bars
- horizontally scrollable forms
- desktop tables as the only representation

### Medium

Use:

- one column by default
- optional side rail if navigation is stable
- two-pane only for flows where selection and detail both remain readable
- larger hit targets and readable spacing

Avoid assuming this is always a tablet. It can be a small desktop window.

### Expanded

Use:

- navigation rail or compact sidebar
- master/detail for feed, topics, sources and alert review
- persistent filters where they materially improve scanning
- keyboard focus states and hover affordances

Avoid stretching forms or prose to full width. Use `AppMaxWidth`.

### Wide And UltraWide

Use:

- persistent sidebar
- content plus detail panes
- optional context panel for source metadata, evidence, trace or summary
- dense but structured tables
- fixed-width inspector panes

Avoid turning every section into a card. Operational UIs need scannable structure more than decoration.

## Component Rules

All adaptive decisions should be made at one of these levels:

1. App shell: navigation model, sidebar/rail/bottom nav, route outlet.
2. Screen layout: list/detail, filters/content, dashboard grid.
3. Component layout: a reusable component rearranges its internal pieces based on local constraints.

Do not let leaf widgets query device type and invent their own behavior.

Do not let feature packages define private breakpoint constants.

Do not let package-specific widgets leak across the feature boundary.

## State And Performance Rules

MobX observers should be placed close to the widget that actually needs the observable value.

For realtime feeds:

- do not rebuild the whole shell on each incoming event
- use lazy lists
- keep row widgets small and keyed
- memoize expensive formatting outside `build`
- debounce filter/search inputs where useful
- keep network DTOs out of widgets

For adaptive layout:

- avoid excessive nested `LayoutBuilder` usage in list rows
- branch high in the component tree when the whole pattern changes
- branch locally only when a component's own constraints matter
- do not compute breakpoints from platform labels

## Accessibility And Input Rules

Desktop quality is not only width. It also requires:

- keyboard traversal
- focus-visible styling
- hover states where useful
- right-click or overflow menu only as a supplement, not the only path
- sensible scroll areas
- readable tables
- selectable/copyable text where analysts need it

Mobile quality requires:

- touch targets that remain usable
- sheets and dialogs that fit small screens
- no hover-only controls
- readable text scale behavior
- screen-reader semantics through `headless` and app adapters

## Testing Matrix

Minimum widget/golden widths:

- `360`
- `390`
- `600`
- `839`
- `840`
- `1199`
- `1200`
- `1440`

Minimum flows:

- app shell navigation
- feed list and detail
- topic settings
- source connection status
- filters open/close
- empty, loading, error and permission states
- text scale at normal and increased sizes
- keyboard focus traversal on desktop layouts

Minimum technical checks:

- no horizontal overflow at supported widths
- no clipped button text
- no layout shift from loading labels
- no direct `headless` imports outside `design_system`
- no direct adaptive package imports outside `design_system`
- no feature-owned breakpoint constants

## Anti-Patterns To Block

- scaling the whole UI by viewport width
- treating `mobile/tablet/desktop` as exact device categories
- locking orientation instead of adapting
- desktop forms stretched full width
- mobile screens that only shrink desktop tables
- feature modules importing raw UI packages directly
- nested scroll views without a single clear owner
- global app rebuilds from realtime state
- hover-only actions
- adaptive behavior hidden inside one-off feature widgets

## Architecture Rule

Adaptive behavior is a design-system responsibility.

Feature code may choose semantic layout intent, such as feed list/detail or settings form. It must not own raw breakpoint constants, global screen scaling, or package-specific adaptive widgets.

If a third-party adaptive, table, grid, split-pane, preview or desktop package is added, it must be wrapped by `social_monitor_design_system` or a narrow infrastructure adapter before feature usage.

The default path is:

```text
Flutter constraints
  -> product breakpoints
  -> design_system adaptive primitives
  -> feature composition
```

## Sources

- Flutter adaptive and responsive overview: https://docs.flutter.dev/ui/adaptive-responsive
- Flutter adaptive design best practices: https://docs.flutter.dev/ui/adaptive-responsive/best-practices
- Flutter general adaptive approach: https://docs.flutter.dev/ui/adaptive-responsive/general
- Flutter architecture guide: https://docs.flutter.dev/app-architecture/guide
- Flutter performance best practices: https://docs.flutter.dev/perf/best-practices
- `flutter_adaptive_scaffold`: https://pub.dev/packages/flutter_adaptive_scaffold
- `responsive_framework`: https://pub.dev/packages/responsive_framework
- `responsive_builder`: https://pub.dev/packages/responsive_builder
- `flutter_screenutil`: https://pub.dev/packages/flutter_screenutil
- `sizer`: https://pub.dev/packages/sizer
- `flutter_layout_grid`: https://pub.dev/packages/flutter_layout_grid
- `go_router`: https://pub.dev/packages/go_router
- `mobx`: https://pub.dev/packages/mobx
- `flutter_mobx`: https://pub.dev/packages/flutter_mobx
- `data_table_2`: https://pub.dev/packages/data_table_2
- `two_dimensional_scrollables`: https://pub.dev/packages/two_dimensional_scrollables
- `pluto_grid`: https://pub.dev/packages/pluto_grid
- `syncfusion_flutter_datagrid`: https://pub.dev/packages/syncfusion_flutter_datagrid
- `multi_split_view`: https://pub.dev/packages/multi_split_view
- `window_manager`: https://pub.dev/packages/window_manager
- `alchemist`: https://pub.dev/packages/alchemist
- `device_preview`: https://pub.dev/packages/device_preview
- `widgetbook`: https://pub.dev/packages/widgetbook
- `headless`: https://pub.dev/packages/headless
