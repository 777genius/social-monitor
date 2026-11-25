# Headless Adaptive Ecosystem Research 2026

## Status

Researched on 2026-06-22 for the proposed `headless_adaptive` package direction.

This document focuses on how to design `headless_adaptive` as a clean, replaceable, ecosystem-grade adaptive layout layer, not as a Social Monitor-only helper.

Research inputs:

- Flutter official adaptive/responsive guidance
- Flutter official architecture and performance guidance
- Flutter package docs for `flutter_adaptive_scaffold` and `responsive_framework`
- competitor docs from Headless UI, Radix Primitives, React Aria, Zag.js, Ark UI, Base UI, Floating UI
- Android Jetpack Compose Material 3 Adaptive release docs
- npm registry metadata checked on 2026-06-22
- existing Social Monitor frontend architecture and Headless wrapper decisions

## Executive Decision

Yes, `headless_adaptive` is a credible package direction.

But it should not be a styled responsive widget kit. It should be a headless adaptive decision system:

```text
constraints / window / input capabilities
  -> adaptive environment
  -> breakpoint and pane policy
  -> layout decision
  -> slot builders
  -> product design system visuals
```

The package should own:

- adaptive classification
- breakpoint policies
- layout decisions
- pane visibility and priority rules
- headless slot orchestration
- typed state exposed to styling layers
- optional controllers for adaptive shell and pane state

The package must not own:

- Social Monitor routes
- MobX stores
- product tokens
- Material visual styling
- app-specific navigation destinations
- generated API clients
- business feature state

## Strong Recommendation

Start as a local incubated package API, then upstream to the Headless ecosystem after real screens validate it.

Best option:

1. Build a local `headless_adaptive` package shape inside `apps/frontend/packages` but keep it product-independent - 🎯 9   🛡️ 9   🧠 7

   This matches the user's direction while still protecting architecture. We can design the public API now, use it in Social Monitor, then move the package into `777genius/flutter_headless` ecosystem with much lower rewrite risk.

   Estimated change size: 1200-2200 LOC for first useful version with tests and examples.

2. Split immediately into `headless_adaptive_core` plus `headless_adaptive_flutter` - 🎯 8   🛡️ 9   🧠 8

   Architecturally clean, but probably too much package-management overhead before the API is proven.

   Estimated change size: 1800-3200 LOC.

3. Keep everything only in `social_monitor_design_system` - 🎯 7   🛡️ 8   🧠 5

   Fastest product path, but weaker for ecosystem extraction. Good fallback if we decide not to maintain a public package.

   Estimated change size: 700-1500 LOC.

## Competitor Lessons

### Flutter Official Adaptive Guidance

Flutter's model is simple and correct:

- abstract the layout pattern
- measure available space
- branch into the right layout
- use `MediaQuery.sizeOf` for app/window size
- use `LayoutBuilder` for local parent constraints
- do not choose layout by device type
- do not lock orientation as a substitute for adaptive design

Lesson for `headless_adaptive`:

The core API should receive an `AdaptiveEnvironment`, not a platform label. It should classify available space and capabilities, then return a layout decision.

### `flutter_adaptive_scaffold`

`flutter_adaptive_scaffold` provides Material 3 adaptive scaffold behavior. It handles macro layout changes for navigation and body areas based on screen width and platform, for example bottom navigation on small screens and navigation rail on larger ones.

Lesson:

Canonical shell patterns are valuable, but `headless_adaptive` should not render Material widgets directly. It should expose decisions and slots so `design_system` chooses visuals.

### `responsive_framework`

`responsive_framework` is useful for responsive websites and general Flutter layouts. It offers breakpoints, responsive values, visibility, row/column helpers, grids, max-width boxes and optional autoscale behavior.

Lesson:

Helpers like `AdaptiveValue<T>`, visibility and max-width constraints are useful. Global autoscaling should not be the core model for an operational product.

### Headless UI

Headless UI is simple: unstyled accessible components for React and Vue.

Lesson:

API simplicity matters. `headless_adaptive` should avoid making users understand a state machine if they only need common adaptive layout.

### Radix Primitives

Radix is the best reference for primitive design:

- unstyled accessible primitives
- granular component parts
- controlled or uncontrolled APIs
- typed, consistent APIs
- focus, keyboard, screen reader behavior handled inside primitives
- styling layer gets state markers like `data-state`

Lesson:

For Flutter, the equivalent is:

- slot builders
- typed state objects
- controlled and uncontrolled controllers
- no product styling
- state exposed to builders through `AdaptiveSlotState`

### React Aria

React Aria goes broad and deep:

- no default styles
- state exposed through data attributes
- render props for styling and child selection
- slots for patterns with repeated parts
- advanced interactions across mouse, touch, keyboard and screen reader

Lesson:

`headless_adaptive` should expose typed state to builders, not hide decisions inside a black-box widget.

### Zag.js

Zag's key architectural move is separating framework-agnostic machines from framework adapters.

It has:

- state machine core
- framework adapters
- `connect` functions that transform machine state into renderable props
- headless APIs
- accessibility logic independent from styling

Lesson:

`headless_adaptive` should separate pure decision logic from Flutter widget adapters. Even if we start as one package, the source tree should preserve that split.

### Ark UI

Ark UI proves the Zag model at component-library level:

- multi-framework headless components
- state-machine powered behavior
- accessible defaults
- bring-your-own-styles model

Lesson:

Package architecture should have a small stable core and framework-specific adapter layer. For Flutter, that means pure Dart decision objects plus Flutter widgets.

### Base UI

Base UI is a newer React headless library from people behind Radix, Floating UI and Material UI.

It emphasizes:

- unstyled accessible components
- composability
- high configurability
- long-term maintenance
- robust edge case handling
- API similarity to Radix for migration

Lesson:

`headless_adaptive` should be boring and migration-friendly. Fancy naming is less valuable than predictable API symmetry.

### Floating UI

Floating UI is not an adaptive layout library, but it is a strong architecture reference:

- small computation core
- framework adapters
- explicit positioning state
- opt-in interactions
- update lifecycle separated from rendering

Lesson:

Keep measurement, decision and rendering separate. `headless_adaptive` should compute layout decisions without directly forcing a widget tree shape.

### Jetpack Compose Material 3 Adaptive

Compose Material 3 Adaptive provides adaptive info, default scaffolds and building block composables. It includes canonical patterns like list/detail and supporting pane layouts that adapt to window size classes and fold/device posture.

Lesson:

Canonical layout patterns are the right abstraction level:

- list/detail
- supporting pane
- navigation shell
- pane scaffold
- slot layout

`headless_adaptive` should expose these as headless primitives.

### SwiftUI

SwiftUI's adaptive model uses tools like size classes, `NavigationSplitView` and `ViewThatFits`.

Lesson:

Ordering preferred layouts is useful. Flutter can mirror this with `AdaptiveFirstFit` or `AdaptiveVariant`, but this should be optional because many product layouts need explicit policies.

## What We Should Build

### Package Shape

Start with one local package:

```text
apps/frontend/packages/headless_adaptive/
  lib/
    headless_adaptive.dart
    src/
      core/
      policies/
      controllers/
      flutter/
      testing/
  test/
```

Keep source boundaries strict so it can later split into:

```text
headless_adaptive_core
headless_adaptive_flutter
headless_adaptive_testing
```

Do not split into multiple public packages until the API survives real screens.

### Clean Architecture Layers

```text
domain
  AdaptiveEnvironment
  AdaptiveBreakpoint
  AdaptiveScreenClass
  AdaptiveInputCapability
  AdaptivePaneRole
  AdaptiveLayoutIntent
  AdaptiveLayoutDecision

application
  ResolveScreenClass
  ResolveAdaptiveValue
  ResolvePaneSet
  ResolveNavigationPattern
  ResolveListDetailLayout

infrastructure
  FlutterAdaptiveEnvironmentReader
  LayoutBuilderEnvironmentAdapter
  MediaQueryEnvironmentAdapter
  DisplayFeatureAdapter

presentation
  AdaptiveBuilder
  AdaptiveValueBuilder
  AdaptiveSlotLayout
  AdaptivePaneScaffold
  AdaptiveListDetailScaffold
  AdaptiveNavigationShell
```

The "domain" and "application" layers should be pure Dart where possible. Flutter-specific code belongs in infrastructure and presentation adapters.

### Public API Draft

```dart
final class AdaptiveBreakpoint {
  const AdaptiveBreakpoint({
    required this.name,
    required this.minWidth,
  });
}

enum AdaptiveScreenClass {
  compact,
  medium,
  expanded,
  wide,
  ultraWide,
}

final class AdaptiveEnvironment {
  const AdaptiveEnvironment({
    required this.size,
    required this.textScaleFactor,
    required this.inputCapabilities,
    required this.displayFeatures,
  });
}

final class AdaptiveDecision {
  const AdaptiveDecision({
    required this.screenClass,
    required this.navigationPattern,
    required this.visiblePanes,
    required this.maxContentWidth,
  });
}
```

Flutter widgets should look like:

```dart
AdaptiveBuilder(
  policy: AppAdaptivePolicy.standard,
  builder: (context, adaptive) {
    return MyLayout(adaptive: adaptive);
  },
)
```

Slot layout should look like:

```dart
AdaptiveSlotLayout(
  policy: const AdaptiveSlotPolicy.listDetail(),
  slots: AdaptiveSlots(
    primary: (context, state) => const FeedList(),
    detail: (context, state) => const FeedDetail(),
    supporting: (context, state) => const FeedFilters(),
  ),
)
```

Navigation should expose decisions, not Material widgets:

```dart
AdaptiveNavigationShell(
  destinations: destinations,
  selectedIndex: selectedIndex,
  onDestinationSelected: onDestinationSelected,
  compactBuilder: buildBottomNavigation,
  mediumBuilder: buildNavigationRail,
  expandedBuilder: buildSidebar,
  body: routeBody,
)
```

### Core Concepts

#### Adaptive Environment

The environment is a normalized input object.

It should include:

- width and height
- text scale
- view padding and insets
- pointer/keyboard/touch capability
- display features and folds when available
- platform only as secondary metadata
- optional user preferences such as reduced motion

It should not include:

- route names
- feature names
- product tokens
- business state

#### Adaptive Policy

Policies define how decisions are made.

Examples:

```dart
const AdaptivePolicy(
  breakpoints: AdaptiveBreakpoints.materialLike(),
  navigation: AdaptiveNavigationPolicy.standard(),
  panes: AdaptivePanePolicy.listDetail(),
)
```

Policy must be immutable and easy to test.

#### Adaptive Decision

Decision is the output.

It should answer:

- which screen class is active
- which navigation pattern is preferred
- which panes are visible
- which pane is primary
- whether detail should be routed, inline or modal
- whether supporting content is hidden, side pane or bottom sheet
- max content width
- grid density hints

#### Slot State

Slot builders receive state.

Example:

```dart
final class AdaptiveSlotState {
  const AdaptiveSlotState({
    required this.role,
    required this.visibility,
    required this.isPrimary,
    required this.screenClass,
  });
}
```

This is the Flutter equivalent of React Aria/Radix state attributes.

## Package Boundary Rules

`headless_adaptive` may depend on:

- Dart SDK
- Flutter `widgets.dart`
- Flutter `foundation.dart`

`headless_adaptive` should avoid depending on:

- `material.dart`
- `cupertino.dart`
- `go_router`
- MobX
- Riverpod
- Bloc
- app design tokens
- app localization
- generated APIs

If Material convenience is needed later, create:

```text
headless_adaptive_material
```

That package can provide Material 3 ready builders, but the core package should remain unstyled.

## Controlled And Uncontrolled State

Competitors consistently support controlled/uncontrolled patterns.

For Flutter, use:

- `controller` for advanced control
- `initialValue` or `defaultValue` for simple usage
- `onChanged` for app integration
- `ValueListenable` where useful

Example:

```dart
AdaptivePaneController? controller;
AdaptivePaneRole initialPane;
ValueChanged<AdaptivePaneRole>? onPaneChanged;
```

Do not tie this to MobX or router state.

## Router Integration

The package should not depend on `go_router`.

It can expose route-neutral concepts:

- `AdaptiveNavigationDestination`
- `AdaptivePaneSelection`
- `AdaptiveBackBehavior`
- `AdaptiveRouteIntent`

Social Monitor can bridge these to `go_router` inside app code.

## Accessibility And Input

`headless_adaptive` should help consumers do the right thing:

- preserve focus when panes appear or disappear
- expose keyboard traversal hints
- avoid hover-only actions on touch-first layouts
- expose screen-reader labels for pane changes
- provide stable semantics for hidden or offstage panes
- support text scale changes

But it should not pretend to solve all component accessibility. Interactive controls still belong to `headless` and `design_system` wrappers.

## Testing Strategy

Pure Dart tests:

- breakpoint resolution
- adaptive value resolution
- navigation pattern decision
- pane visibility decision
- fold/display feature policies
- text scale and content width policies

Flutter widget tests:

- `AdaptiveBuilder` updates when constraints change
- `AdaptiveSlotLayout` shows correct slots per width
- `AdaptiveNavigationShell` calls the correct builders
- pane controller preserves selection across width transitions
- no rebuild loop when constraints are stable

Golden/app tests should live in consuming apps or examples:

- compact `360`
- phone `390`
- medium `600`
- split boundary `839`
- expanded `840`
- desktop `1200`
- wide `1440`
- ultra-wide `1600`

## Migration Plan

### Phase 1 - Local Incubation

Create `apps/frontend/packages/headless_adaptive` with clean package boundaries.

Implement:

- `AdaptiveBreakpoint`
- `AdaptiveScreenClass`
- `AdaptiveEnvironment`
- `AdaptivePolicy`
- `AdaptiveDecision`
- `AdaptiveBuilder`
- `AdaptiveValue<T>`
- `AdaptiveSlotLayout`
- `AdaptiveListDetailScaffold`

Estimated change size: 1200-2200 LOC.

### Phase 2 - Product Validation

Use it in three Social Monitor surfaces:

- feed list/detail
- sources dashboard/list/detail
- settings/admin layout

Acceptance:

- no Social Monitor naming leaks into `headless_adaptive`
- `design_system` owns visuals
- feature packages do not import Flutter adaptive helper packages directly
- layout works from compact to desktop

Estimated change size: 900-1800 LOC across app/design system integration.

### Phase 3 - Ecosystem Extraction

Move generic package to Headless ecosystem if:

- API stays generic after three screens
- docs can be written without Social Monitor examples
- tests are independent
- package has stable semantic names
- examples cover list/detail, navigation shell and slot layout

Estimated extraction size: 500-1200 LOC.

## Top 3 Architecture Options

1. Local `headless_adaptive` package now, public extraction later - 🎯 9   🛡️ 9   🧠 7

   Best balance. It respects the ecosystem goal while forcing the API through real product screens first.

   Estimated total change: 2600-5200 LOC across package, tests and first app integration.

2. Public Headless ecosystem package immediately - 🎯 7   🛡️ 7   🧠 9

   Strong branding and ecosystem momentum, but higher risk of publishing bad API names or overfitting to imagined use cases.

   Estimated total change: 3000-6500 LOC including docs, examples and release work.

3. Product-only `design_system` primitives - 🎯 7   🛡️ 8   🧠 5

   Fastest for Social Monitor, weakest for reusable ecosystem value.

   Estimated total change: 1600-3300 LOC.

## Risks

### Over-Abstraction

Risk: building a generic framework before knowing real layout needs.

Mitigation: implement only the first three primitives, then expand:

- `AdaptiveBuilder`
- `AdaptiveValue<T>`
- `AdaptiveSlotLayout`

### Material Leakage

Risk: package becomes a Material scaffold wrapper.

Mitigation: core package imports `widgets.dart`, not `material.dart`.

### App Leakage

Risk: Social Monitor concepts leak into ecosystem API.

Mitigation: all names must make sense in a generic dashboard, mail client or file manager.

### State Coupling

Risk: coupling to MobX or `go_router`.

Mitigation: controllers, callbacks and pure values only.

### Too Many Packages Too Early

Risk: package split creates maintenance overhead before API maturity.

Mitigation: one package with internal source boundaries first, split after validation.

## API Naming Rules

Prefer:

- `AdaptiveEnvironment`
- `AdaptivePolicy`
- `AdaptiveDecision`
- `AdaptiveSlotLayout`
- `AdaptivePaneScaffold`
- `AdaptiveListDetailScaffold`
- `AdaptiveNavigationShell`
- `AdaptiveValue<T>`

Avoid:

- `ResponsiveScaffold`
- `MobileDesktopBuilder`
- `DeviceBuilder`
- `ScreenUtil`
- `AppAdaptive...` in the ecosystem package
- `SocialMonitor...`

The word `adaptive` is better than `responsive` here because the package should change interaction patterns, not only resize.

## Decision For Social Monitor

Proceed toward `headless_adaptive`, but do it in a disciplined sequence:

```text
local package API
  -> app integration through design_system
  -> validate on real screens
  -> extract to Headless ecosystem
```

Immediate next implementation should create:

```text
apps/frontend/packages/headless_adaptive
```

and add it to the Flutter workspace.

`social_monitor_design_system` should depend on `headless_adaptive`, then expose product-specific wrappers. Feature packages should depend on `social_monitor_design_system`, not directly on `headless_adaptive`, unless the feature is implementing a low-level layout component owned by the frontend platform layer.

## Sources

- Flutter adaptive general approach: https://docs.flutter.dev/ui/adaptive-responsive/general
- Flutter adaptive best practices: https://docs.flutter.dev/ui/adaptive-responsive/best-practices
- Flutter architecture guide: https://docs.flutter.dev/app-architecture/guide
- Flutter performance best practices: https://docs.flutter.dev/perf/best-practices
- `flutter_adaptive_scaffold` API docs: https://pub.dev/documentation/flutter_adaptive_scaffold/latest/
- `responsive_framework`: https://pub.dev/packages/responsive_framework
- Headless UI: https://headlessui.com/
- Radix Primitives: https://www.radix-ui.com/primitives
- Radix styling guide: https://www.radix-ui.com/primitives/docs/guides/styling
- React Aria getting started: https://react-aria.adobe.com/getting-started
- React Aria styling: https://react-aria.adobe.com/styling
- Zag.js: https://zagjs.com/
- Ark UI: https://ark-ui.com/
- Ark UI about: https://ark-ui.com/docs/overview/about
- Base UI: https://base-ui.com/
- Floating UI React: https://floating-ui.com/docs/react
- Floating UI computePosition: https://floating-ui.com/docs/computeposition
- Compose Material 3 Adaptive: https://developer.android.com/jetpack/androidx/releases/compose-material3-adaptive
- SwiftUI `ViewThatFits`: https://developer.apple.com/documentation/swiftui/viewthatfits
- SwiftUI `NavigationSplitView`: https://developer.apple.com/documentation/swiftui/navigationsplitview

## Package Metadata Checked

Checked through npm registry on 2026-06-22:

| Package | Version | Published | License | Note |
| --- | ---: | --- | --- | --- |
| `@headlessui/react` | `2.2.10` | 2026-04-07 | MIT | simple unstyled accessible components |
| `radix-ui` | `1.6.0` | 2026-06-15 | MIT | facade for Radix primitives |
| `@radix-ui/react-dialog` | `1.1.17` | 2026-06-15 | MIT | mature primitive example |
| `react-aria-components` | `1.19.0` | 2026-06-18 | Apache-2.0 | broad accessible component system |
| `@zag-js/core` | `1.41.2` | 2026-06-05 | MIT | state machine core |
| `@zag-js/react` | `1.41.2` | 2026-06-05 | MIT | React adapter |
| `@ark-ui/react` | `5.37.2` | 2026-06-08 | MIT | components on top of Zag |
| `@base-ui-components/react` | `1.0.0-rc.0` | 2025-12-04 | MIT | newer unstyled React library |
| `@floating-ui/react` | `0.27.19` | 2026-03-03 | MIT | positioning and interaction primitives |
