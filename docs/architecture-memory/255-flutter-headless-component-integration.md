# 255 - Flutter Headless Component Integration

## Decision

The Flutter app must use `777genius/flutter_headless` through a local `design_system` wrapper package.

Feature code must not consume raw `headless` package components directly.

## Sources

- `777genius/flutter_headless`: https://github.com/777genius/flutter_headless
- Headless docs site: https://777genius.github.io/flutter_headless/
- Flutter accessibility widgets: https://docs.flutter.dev/ui/widgets/accessibility
- Flutter Semantics API: https://api.flutter.dev/flutter/semantics/
- MobX.dart documentation: https://mobx.netlify.app/

## Observed Library Position

The repository describes Headless as Flutter UI building blocks for consistent behavior, keyboard handling, accessibility and state while allowing Material, Cupertino or custom visuals.

That matches this product's need: reusable behavior with product-specific styling.

## Integration Shape

```text
headless packages
  -> packages/design_system adapters
    -> feature widgets
      -> MobX presentation stores
```

Only `design_system` may import:

- `package:headless/...`
- `package:headless_button/...`
- `package:headless_dropdown_button/...`
- other Headless component packages

Feature packages import:

```dart
import 'package:design_system/design_system.dart';
```

## Component Ownership

`design_system` owns:

- buttons
- dropdowns
- checkboxes
- segmented controls
- menus
- tooltips/popovers
- tabs
- dialogs
- form fields
- loading/error/empty states

Feature packages own:

- domain-specific cards/list rows
- screen composition
- store binding
- route-specific behavior

## Styling Rule

Use Headless behavior and slots/presets, but all product visual decisions come from product tokens.

Do not fork Headless behavior to change colors, spacing or radius.

If a Headless component cannot support required behavior, create a `design_system` adapter issue and decide:

- use supported slots/style API
- contribute upstream
- wrap with product-specific behavior
- build a new component only with documented reason

## Accessibility Rule

Every adapter must define:

- semantic label behavior
- disabled/loading semantics
- focus behavior
- keyboard navigation expectations
- screen-reader text for icon-only controls
- text scale behavior

Headless helps with accessibility behavior, but product adapters still own final UX semantics.

## MobX Boundary

Headless components receive simple values/callbacks.

They do not know MobX stores.

Feature widgets bind:

```text
Observer -> design_system component -> store action
```

This keeps UI primitives reusable and testable.

## Versioning

Pin Headless package versions.

Upgrades require:

- component snapshot/golden review
- accessibility smoke tests
- keyboard navigation smoke tests
- migration note if API changed

## Architecture Rule

Headless provides behavior primitives.

`design_system` turns them into product components.
