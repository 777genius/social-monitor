# 160. Internationalization and Accessibility Baseline

## Status

Locked for Flutter/product UX baseline.

## Research Anchors

- Flutter internationalization: https://docs.flutter.dev/ui/internationalization
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C WCAG 2.2 overview: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/

## Decision

Build localization and accessibility into the Flutter design system from the beginning. Do not hardcode product text inside feature widgets/stores.

## I18n Rules

- Use Flutter localization tooling and generated localization classes.
- Keep user-visible strings out of domain/application layers.
- Format dates, times and numbers using locale-aware APIs.
- Store canonical timestamps in UTC/RFC 3339; localize only at presentation.
- Summary output language is explicit in summary policy.
- Topic/source rules can be multilingual, but language metadata must be stored.

## Accessibility Rules

Baseline target: WCAG 2.2 AA where applicable.

Controls:

- semantic labels for icon-only buttons;
- sufficient color contrast;
- scalable text without overflow;
- focus order for keyboard/screen-reader use;
- status messages exposed to assistive tech;
- touch targets large enough for mobile;
- no color-only state indicators;
- loading/error/empty states announced clearly.

## Design System Boundary

The local wrapper around `flutter_headless` owns:

- accessible component defaults;
- semantic labels conventions;
- localization integration;
- text overflow policies;
- theme contrast checks.

## Best-Fact Choice

Accessibility and i18n are cheaper as component-level defaults than late feature-by-feature remediation.

