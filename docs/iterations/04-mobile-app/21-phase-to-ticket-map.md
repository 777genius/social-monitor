# Iteration 04 - Phase To Ticket Map

| Phase | Ticket Groups | Key Artifacts | Closure Evidence |
| --- | --- | --- | --- |
| 01-flutter-architecture-shell | Shell, DI, generated client, feature layout | App shell | Feature boundaries exist |
| 02-design-system-headless | Headless components, theme, controls | UI component layer | Required components used |
| 03-feature-screens | Topic, source, feed, summary, feedback | Feature screens/stores | Full MVP flow works |
| 04-offline-secure-release | Offline, stale, secure storage, smoke | Resilience states | App handles failure states |

## Ticket Cutting Rule

Each mobile ticket must identify feature layer, generated DTO boundary and user-visible state impact.

## Traceability Rule

Before a ticket is ready, map it to `08-ticket-breakdown.md`, `11-acceptance-test-plan.md`, `14-traceability-matrix.md` and `59-traceable-evidence-register.md`. If the ticket cannot produce evidence, split or rewrite it.
