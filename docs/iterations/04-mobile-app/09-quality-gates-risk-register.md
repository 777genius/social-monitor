# Iteration 04 - Quality Gates And Risk Register

## Hard Gates

1. Flutter app shell runs.
2. Feature-scoped folder structure is in place.
3. Generated REST client is wrapped by infrastructure repositories/clients.
4. MobX stores are presentation-level only.
5. Topic creation flow works.
6. Source binding and interval flow works.
7. Feed screen handles loading, empty, error and stale states.
8. Summary screen shows citations and failure states.
9. Offline/resume behavior is defined.
10. Headless component usage follows the required architecture.

## Architecture Checks

- Generated DTOs do not become domain entities.
- Widgets do not enforce core business invariants.
- Feature infrastructure is not imported directly by other features.
- Stores orchestrate state but do not bypass use cases.
- Error states map backend failure taxonomy into user-understandable UI.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| UI gets built before contracts stabilize | Rework | Generate clients from OpenAPI and watch diffs. |
| Stores become domain services | Architecture decay | Keep domain/application classes testable without Flutter. |
| Empty/error states are skipped | Bad beta UX | Require state matrix per screen. |
| Source limitations are hidden | User confusion | Surface provider warnings and capabilities. |
| Offline cache shows unsafe stale data | Trust issue | Display stale indicators and revalidate on resume. |

## Edge Cases To Recheck

- Source binding paused while scan runs.
- Feed is empty because first scan has not completed.
- Summary exists but cited item is unavailable.
- Token expires while app is offline.
- Backend returns partial success.

## Transition Criteria

Move to Iteration 05 only when a mobile user can complete topic -> source binding -> feed -> cited summary without developer help.
