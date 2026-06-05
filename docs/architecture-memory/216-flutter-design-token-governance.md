# 216 - Flutter Design Token Governance

## Decision

Flutter UI uses a first-party `design_system` package that wraps `flutter_headless` components and exposes product-specific tokens, themes and component contracts.

Feature code must not import raw color constants, typography constants or third-party headless primitives directly.

## Why This Is Locked

Flutter Material components are driven mainly through `ThemeData`, `ColorScheme` and `TextTheme`. Material 3 formalizes color roles/tokens rather than one-off component colors.

For this product, that means design consistency is an architecture concern, not a screen-level preference.

## Sources

- Flutter themes cookbook: https://docs.flutter.dev/cookbook/design/themes
- Flutter Material 3 migration: https://docs.flutter.dev/release/breaking-changes/material-3-migration
- Flutter `ColorScheme` API: https://api.flutter.dev/flutter/material/ColorScheme-class.html
- Material Design color system: https://m3.material.io/styles/color/overview
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

## Package Layout

```text
apps/mobile/
packages/
  design_system/
    lib/tokens/
    lib/theme/
    lib/components/
    lib/accessibility/
  feature_*/
```

`design_system` owns:

- color roles
- typography scale
- spacing scale
- radius scale
- elevation/shadow tokens
- motion duration/easing tokens
- semantic status colors
- light/dark themes
- component adapters around `flutter_headless`

## Import Rule

Allowed in features:

```dart
import 'package:design_system/design_system.dart';
```

Forbidden in features:

```dart
import 'package:flutter_headless/...';
import 'package:flutter/material.dart' show Colors;
```

`material.dart` is still allowed for framework widgets, but raw Material color/style decisions must come from `design_system`.

## Token Model

Minimum token groups:

- `AppColorTokens`
- `AppTextTokens`
- `AppSpacingTokens`
- `AppRadiusTokens`
- `AppMotionTokens`
- `AppSemanticTokens`

Semantic tokens are required for:

- source connected
- source attention required
- scan running
- scan failed
- summary ready
- quota limited
- destructive action

## Theme Policy

Use `ColorScheme` as the canonical Material color bridge.

Do not theme by copying colors into every widget. Component themes are used only when a Material component does not map cleanly to the product token.

## Component Policy

Every reused UI primitive has three layers:

```text
flutter_headless primitive -> design_system adapter -> feature widget
```

The adapter owns:

- visual styling
- accessibility defaults
- touch target size
- loading/disabled/error states
- focus and keyboard behavior

Feature widgets own:

- business state mapping
- presentation store binding
- local layout composition

## Accessibility Gates

Every design-system component must define:

- semantic label behavior
- focus order expectations
- min tap target
- text scaling behavior
- contrast expectations
- loading and disabled announcements where relevant

## Testing

Required:

- golden tests for shared components
- light/dark theme snapshots
- text scale smoke tests
- accessibility semantics tests for critical controls
- feature tests that verify domain states map to semantic UI states

## Non-Goals

- No per-feature private theme systems.
- No direct dependency on `flutter_headless` from feature packages.
- No screen-specific color constants.
- No design token changes without snapshot review.
