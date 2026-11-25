# Iteration 04 - Traceability Matrix

| Goal | Phase | Ticket Area | Contract/Artifact | Tests/Checks | Done Evidence |
| --- | --- | --- | --- | --- | --- |
| Build app shell | 01-flutter-architecture-shell | Mobile platform | Feature folders, DI, generated client | App smoke | Shell runs |
| Use headless components | 02-design-system-headless | UI system | Component wrappers | UI review | Required components used |
| Build core features | 03-feature-screens | Topic/source/feed/summary | Screens, stores, mappers | Store tests, full flow | MVP loop works in app |
| Handle resilience | 04-offline-secure-release | Mobile infra | Offline/stale/session handling | Offline/resume test | Failure states visible |
| Preserve boundaries | 01-flutter-architecture-shell | Architecture | Feature-scoped layers | DTO leak check | Domain free from DTOs |

## Unmapped Risk Check

- Contract drift maps to generated client.
- Confusing source failures map to error state mapping.
- Store/domain leakage maps to store tests.
- Offline stale data maps to stale indicators.
