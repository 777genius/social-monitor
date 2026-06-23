# Iteration 04 - Risk-Based Priority

## Priority 1 - Generated Client Boundary

- Risk: API DTOs leak into domain and make changes expensive.
- Do First: Wrap generated client in infrastructure repositories/clients.
- Do Not Defer: DTO/domain mapping.

## Priority 2 - Operational Failure States

- Risk: Users cannot understand scan/source/summary failures.
- Do First: Loading, empty, error, stale and offline state model.
- Do Not Defer: Provider quota/source capability display.

## Priority 3 - Full MVP Loop

- Risk: Screens exist but workflow does not complete.
- Do First: Topic -> source binding -> feed -> cited summary.
- Do Not Defer: End-to-end mobile smoke.

## Priority 4 - Store Boundaries

- Risk: MobX stores become business logic containers.
- Do First: Stores orchestrate use cases only.
