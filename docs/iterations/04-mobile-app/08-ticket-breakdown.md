# Iteration 04 - Ticket Breakdown

## Phase 01 - Flutter Architecture Shell

### T04-01 - Scaffold Feature-Scoped App

- Context: Mobile Platform
- Layer: Flutter app shell
- Artifacts: app structure, DI, navigation, generated API client boundary
- Steps:
  1. Create feature folders with domain/application/infrastructure/presentation.
  2. Add app navigation shell.
  3. Add API client generation setup.
  4. Add environment config.
  5. Add base error and loading state models.
- Edge cases:
  - Generated DTOs leak into domain.
  - Global store starts owning feature state.
- Acceptance:
  - Empty app runs with feature boundaries in place.

## Phase 02 - Design System Headless

### T04-02 - Integrate Required Headless Components

- Context: Mobile UI
- Layer: Presentation/design system
- Artifacts: component wrappers, theme, interaction patterns
- Steps:
  1. Use components from `flutter_headless`.
  2. Create local wrappers only where needed.
  3. Define form fields, lists, status chips and settings controls.
  4. Add accessibility labels and states.
- Edge cases:
  - Component does not support required state.
  - Styling breaks dense operational UI.
- Acceptance:
  - Feature screens use consistent reusable components.

## Phase 03 - Feature Screens

### T04-03 - Build Topic And Source Binding Features

- Context: Topic/Source Binding
- Layer: Mobile feature
- Artifacts: screens, MobX stores, repositories, mappers
- Steps:
  1. Add topic list/create/edit.
  2. Add source catalog list.
  3. Add source binding create/edit/pause.
  4. Add scan interval controls.
  5. Add validation and backend error mapping.
- Edge cases:
  - Source has unsupported capability.
  - Interval too aggressive.
  - Binding paused while scan is running.
- Acceptance:
  - User can configure a monitored topic from mobile.

### T04-04 - Build Feed And Summary Features

- Context: Feed/Summarization
- Layer: Mobile feature
- Artifacts: feed screen, item detail, summary screen, citation UI
- Steps:
  1. Add feed list and filters.
  2. Add item detail with provenance.
  3. Add latest summary screen.
  4. Add citation navigation.
  5. Add summary feedback.
- Edge cases:
  - Empty feed before first scan.
  - Summary failed but feed has items.
  - Citation points to unavailable item.
- Acceptance:
  - User can inspect feed and understand why summary says what it says.

## Phase 04 - Offline Secure Release

### T04-05 - Add Offline And Release Readiness

- Context: Mobile Platform
- Layer: Infrastructure/ops
- Artifacts: cache policy, secure storage, release config
- Steps:
  1. Add session persistence.
  2. Add stale data indicators.
  3. Add offline read behavior.
  4. Add secure token storage.
  5. Add mobile smoke tests.
- Edge cases:
  - Token expires offline.
  - App resumes after backend contract changed.
- Acceptance:
  - App handles loading, empty, error, stale and offline states.
