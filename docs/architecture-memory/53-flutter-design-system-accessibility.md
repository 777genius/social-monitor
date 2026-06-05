# Flutter Design System & Accessibility

Date: 2026-05-31
Status: baseline Flutter design/accessibility memory

## Decision

Use `flutter_headless` through a product design system package, not directly across features.

Layering:

```text
flutter_headless primitive
-> packages/design_system styled component
-> feature presentation widget
```

Reference:

- flutter_headless: https://github.com/777genius/flutter_headless

## Design System Owns

```text
theme tokens
spacing
typography
color semantics
focus states
accessibility behavior
responsive primitives
headless wrappers
common controls
```

Feature modules own product composition, not primitive styling.

## Accessibility

Flutter uses a semantics tree for accessibility. Web accessibility maps Flutter semantics to an accessible HTML DOM.

Requirements:

- semantic labels for icon-only buttons;
- focus order for keyboard navigation;
- accessible error messages;
- sufficient contrast;
- screen-reader-friendly status changes;
- no color-only meaning;
- touch targets sized correctly;
- loading/progress states announced where appropriate.

References:

- Flutter accessibility: https://docs.flutter.dev/ui/accessibility
- Flutter web accessibility: https://docs.flutter.dev/ui/accessibility/web-accessibility
- Flutter semantics API: https://api.flutter.dev/flutter/semantics/

## Localization

Use Flutter's official localization flow with ARB files.

References:

- Flutter internationalization: https://docs.flutter.dev/ui/internationalization

Rules:

- no hardcoded user-facing strings in widgets;
- no localized labels as stable IDs;
- API/domain errors mapped to localized presentation messages;
- source/platform names are data, not localization keys.

## Locked Decisions

1. `flutter_headless` is wrapped by design_system.
2. Feature modules do not import headless primitives directly by default.
3. Accessibility is design-system responsibility and feature responsibility.
4. ARB/localization is used for user-facing strings.
5. Stable IDs are never localized strings.

