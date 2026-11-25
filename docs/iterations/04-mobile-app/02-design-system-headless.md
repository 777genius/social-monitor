# Iteration 04 / Phase 02 - Design System And Headless Components

## Objective

Implement product design system wrapping `flutter_headless`.

## Steps

1. Add `design_system` package.
2. Review `flutter_headless` repository/API and pin the approved version or commit before implementation.
3. Wrap required headless components: buttons, dropdowns, tabs, dialogs, forms, tooltips.
4. Add tokens: color, spacing, typography, radius, semantic states.
5. Add light/dark themes.
6. Add accessibility semantics defaults.
7. Add golden/snapshot tests.

## Required MVP Components

Wrap or implement through approved `flutter_headless` primitives:

1. primary/secondary/destructive/icon buttons
2. text input, select, checkbox/toggle, segmented control
3. tabs and filter chips
4. dialogs/bottom sheets
5. tooltip and semantic label helpers
6. status badge
7. source capability/limitation chip
8. feed item row
9. summary citation row
10. loading/empty/error/stale/offline state blocks

Component rules:

1. Feature code imports only `design_system`.
2. Components expose semantic states, not provider-specific statuses.
3. Text must wrap/clamp intentionally under small phone width and text scale.
4. Icon-only actions require semantic labels.
5. Components used in dense lists have stable height or predictable expansion.

## Edge Cases

- Feature imports headless package directly.
- `flutter_headless` API changes after implementation starts.
- A required control is not available in `flutter_headless`.
- Text overflows on mobile.
- Icon-only button has no semantic label.
- Disabled/loading states are visually ambiguous.
- Capability chip has a long source limitation label.
- Citation row contains many citations and long source titles.
- Text scale causes button labels to overflow.
- Dark theme reduces contrast for degraded/failed states.

## Pay Attention

- Headless provides behavior; design_system provides product visuals.
- No per-feature private component styling.
- Use stable dimensions for toolbar/status controls.
- Missing primitives should be wrapped as local design_system adapters, not replaced by one-off feature widgets.
- Avoid nested cards; use section layouts, rows and compact panels for operational screens.
- Do not create decorative components that do not support core monitoring workflows.

## Acceptance Criteria

- Feature code imports only design_system.
- Approved `flutter_headless` version/commit is recorded in the mobile decision log.
- Basic components have accessibility tests.
- Light/dark snapshots pass.
- Text scale smoke test passes.
- Direct `flutter_headless` imports outside `design_system` fail lint/review.
- Long text and dense list golden cases pass.
