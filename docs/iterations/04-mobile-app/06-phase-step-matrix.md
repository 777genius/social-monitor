# Iteration 04 - Phase Step Matrix

## Phase 01 - Flutter Architecture Shell

### Build Steps

1. Read `flutter_headless` component patterns.
2. Create feature folders.
3. Add DI.
4. Add routing.
5. Add auth guard.
6. Add generated OpenAPI client.
7. Add WebSocket port.
8. Add secure storage.
9. Add base MobX stores.

### Dependencies

- OpenAPI contract.
- Backend auth/session endpoints.

### Edge Cases

- Token expires on resume.
- API model changes without regeneration.
- Workspace switches mid-request.

### Validation

- App shell can authenticate and call API through generated client.

## Phase 02 - Design System Headless

### Build Steps

1. Create component inventory.
2. Build status badges.
3. Build source capability display.
4. Build topic card/list row.
5. Build feed item row.
6. Build summary citation view.
7. Build empty/loading/error states.
8. Add golden tests.

### Dependencies

- `flutter_headless`.

### Edge Cases

- Long text overflow.
- Source warnings crowd small screen.
- Summary citations are numerous.

### Validation

- No core component breaks mobile layout with long content.

## Phase 03 - Feature Screens

### Build Steps

1. Auth screen.
2. Workspace dashboard.
3. Topic list/create/edit.
4. Source setup.
5. Feed timeline.
6. Feed item detail.
7. Summary list/detail.
8. Scan status.
9. Alert/digest settings.

### Dependencies

- Backend APIs.
- Design system.

### Edge Cases

- Empty workspace.
- Source disabled.
- Scan failed.
- Summary running.

### Validation

- User can complete MVP loop on mobile.

## Phase 04 - Offline Secure Release

### Build Steps

1. Add read cache.
2. Add offline state.
3. Add secure token storage.
4. Add crash hooks.
5. Add integration tests.
6. Add release config.
7. Add environment config.

### Dependencies

- Stable feature screens.

### Edge Cases

- Cached old tenant data.
- Offline mutation conflicts.
- Expired token with cached data.

### Validation

- Beta build is stable for core workflows.

