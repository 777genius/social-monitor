# Frontend Docs

Frontend-specific architecture notes, implementation research and UI decisions live here.

Use this folder for decisions that mainly affect `apps/frontend`, `app`, `packages/design_system` or frontend feature packages.

Global product architecture memory should only keep decisions that affect multiple subsystems.

## Sections

- `research/` - investigated frontend approaches, package choices and technical tradeoffs.

## Pre-Scale Playbooks

Read these before growing real frontend features:

- `frontend-ux-architecture.md` - app shell, route hierarchy, workspace switcher, responsive navigation, empty/repair states and back behavior.
- `design-system-component-roadmap.md` - shared component roadmap and maturity gates.
- `frontend-state-playbook.md` - store/use-case recipes for lists, details, forms, optimistic updates, realtime merge and cache refresh.
- `frontend-api-contract-playbook.md` - generated API, pagination, filters, unknown enums, Problem Details and mapper tests.
- `frontend-testing-strategy.md` - frontend test pyramid, responsive tests, route tests and critical workflow gates.
- `frontend-observability-decision.md` - provider-neutral observability facade and Sentry/OTel/custom backend decision.
- `frontend-security-privacy-policy.md` - local storage, provider content, logging, screenshots and credential repair privacy rules.
- `frontend-live-development.md` - canonical Flutter web runtime, safe hot reload/restart and Marionette/DWDS recovery.
- `frontend-implementation-plan.md` - end-to-end build sequence from design-system primitives to frontend MVP release candidate.
