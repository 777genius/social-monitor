# Iteration 04 - Detailed Execution Plan

## Purpose

Deferred frontend track. When frontend work is resumed, build the Flutter app as a serious operational interface using feature-scoped Clean Architecture, MobX stores and `flutter_headless` components. For the current backend/API-first MVP, keep this iteration as the implementation blueprint and contract guardrail, not as a launch blocker.

## Phase 01 - Flutter Architecture Shell

### Steps

1. Inspect `flutter_headless` usage patterns.
2. Create feature folders:
   - auth
   - workspace
   - topics
   - sources
   - feed
   - summaries
   - alerts
   - settings
3. Add dependency injection.
4. Add routing with auth guards.
5. Add generated OpenAPI REST client.
6. Add API error mapping.
7. Add realtime connection contract.
8. Add secure token storage.
9. Add app-level session store.
10. Add Problem Details to domain-safe failure mapper.
11. Add request cancellation on logout/workspace switch.
12. Add feature import-boundary checks.

### Architecture Implementation Baseline

1. Create composition root for API client, repositories, stores, cache and realtime implementation.
2. Define `AppFailure` and `RecoveryAction` in shared layer.
3. Wrap generated REST client behind feature infrastructure repositories.
4. Add mappers from generated DTOs to domain/application models.
5. Add MobX store base conventions: state, failure, lastRefreshAt, activeWorkspaceId, dispose/cancel.
6. Add route guards for auth and workspace selection.
7. Add late-response guard for workspace switch.
8. Add lints/import checks preventing feature-private imports and generated DTO leakage.
9. Add fake repository implementations for store tests.
10. Add realtime connection contract as status hint, with REST resync on critical transitions.

### Edge Cases

- Token expires during WebSocket connection.
- Generated client has nullable mismatch.
- Workspace switch while requests are in flight.
- Backend error code is unknown to mobile.
- Feature imports another feature's infrastructure implementation.
- Late API response writes data into disposed store.
- WebSocket event references inactive workspace.
- Generated DTO contains unknown enum value.
- Cache version is older than current mapper contract.

### Acceptance Gate

- App shell boots and can call health/auth APIs through generated client.
- Generated DTOs are mapped before reaching stores/domain.
- Import-boundary, mapper and store cancellation tests pass.

## Phase 02 - Design System Headless

### Steps

1. Define required components from `flutter_headless`.
2. Create app-specific wrappers only where needed.
3. Define typography, spacing and density.
4. Build status badges:
   - healthy
   - delayed
   - failed
   - quota blocked
5. Build source capability chips.
6. Build feed item component.
7. Build summary citation component.
8. Build empty/error/loading states.

### Component Contract Baseline

1. Feature code imports app `design_system`, not `flutter_headless`.
2. Design system wraps approved `flutter_headless` primitives.
3. Component wrappers expose product-specific states: loading, disabled, destructive, selected, stale, degraded.
4. Status/capability labels have stable dimensions or wrapping rules.
5. Icon buttons have semantic labels and tooltips.
6. Long text components define max lines, wrapping and expansion behavior.
7. Golden tests cover small phone, normal phone and text-scale variants.

### Edge Cases

- Long source names overflow.
- Summary citation list is too long.
- Status labels change width and shift layout.
- Dark/light themes expose contrast issues.
- Headless primitive lacks required accessibility behavior.
- Source limitation text is longer than expected.
- Summary citation list contains many short ids and long titles.

### Acceptance Gate

- Core components are reusable and tested with long text.
- No feature imports `flutter_headless` directly.

## Phase 03 - Feature Screens

### Steps

1. Build login/session flow.
2. Build workspace dashboard.
3. Build topic list.
4. Build topic create/edit.
5. Build source binding setup.
6. Show source limitations before enabling.
7. Build feed timeline.
8. Build feed item detail.
9. Build summary list.
10. Build summary detail with citations.
11. Build scan status view.
12. Build alert/digest settings.
13. Add citation-to-source-item navigation.
14. Add typed recovery actions for source, scan, feed and summary failures.
15. Add stale/realtime update indicators.

### Feature Implementation Order

1. Auth/session and workspace selector.
2. Dashboard read model.
3. Topic list/create/detail.
4. Source catalog/binding with limitations.
5. Scan policy edit and scan status.
6. Feed list/detail/provenance.
7. Summary list/detail/citation navigation.
8. Summary feedback/regenerate.
9. Alerts/digest settings.
10. Cross-feature deep links and workspace switch guards.

### Store Test Minimum

Each core feature store tests:

1. initial load success
2. empty state
3. Problem Details failure mapped to recovery action
4. network offline with cached data when supported
5. workspace switch cancels old request
6. late response ignored
7. retry/regenerate idempotency
8. unknown enum/status fallback

### Edge Cases

- No topics yet.
- Topic exists but no sources enabled.
- Source disabled by admin.
- Feed has duplicate-looking items.
- Summary failed due to AI provider issue.
- Realtime update races with manual refresh.
- Summary citation points to unavailable item.
- Topic/source status changes while user edits scan policy.
- Regenerate is tapped repeatedly before first response.
- Summary is superseded while detail screen is open.
- Citation deep link opens after workspace changed.

### Acceptance Gate

- User can complete the core MVP loop on mobile.
- Store tests prove loading, success, empty, error, stale and offline transitions.
- Citation navigation and recovery actions are tested.

## Phase 04 - Offline Secure Release

### Steps

1. Add read-model cache.
2. Add offline state indicators.
3. Add secure storage for auth.
4. Add crash/error reporting hooks.
5. Add widget tests.
6. Add golden tests.
7. Add integration test for core flow.
8. Add release build config.
9. Add tenant/workspace cache namespace.
10. Add crash/error privacy scrubber.
11. Add auth expiry recovery flow.

### Release Safety Rules

1. MVP supports read-cache only; writes are not queued offline unless a use case explicitly supports conflict handling.
2. Cache keys include tenant, workspace, user and contract version.
3. Logout and workspace switch clear or seal old cache before new data renders.
4. Crash/error payloads redact tokens, source content, credentials, prompts and raw provider payloads.
5. Production build fails if API base URL or flavor config is inconsistent.
6. Push/WebSocket events never replace REST read model truth.
7. Secure storage failure forces re-authentication rather than insecure fallback.

### Edge Cases

- Cached data from old workspace appears after switch.
- Offline create action conflicts with server state.
- App resumes with expired token.
- Crash/error payload contains token or source content.
- Offline cache says source is enabled but server revoked access.
- App receives push for old workspace after logout.
- Release build accidentally points to staging API.

### Acceptance Gate

- Frontend remains deferred; when resumed, core flows require a separate beta readiness gate with reliable error/offline handling.
- Cache, secure storage and crash reporting pass tenant/privacy checks.
- Flavor, cache isolation and privacy scrubber checks are automated.
