# Iteration 04 - First Sprint Ticket Cut

## Sprint Objective
Implement the Flutter MVP shell and first feature slices with generated REST clients, MobX stores and clean DTO/domain separation.

## Ticket 1 - Flutter Shell
- Create app shell, routing, dependency registration and baseline theme/system usage.
- Acceptance: app starts with mocked backend and navigation works.
- Edge cases: shell must support auth/tenant context later without rewrite.

## Ticket 2 - Generated Client Wrapper
- Generate REST client from OpenAPI and wrap it in infrastructure adapters.
- Acceptance: generated DTOs do not leak into feature domain.
- Edge cases: backend contract changes must fail visibly in build/tests.

## Ticket 3 - Topic Feature Slice
- Implement topic list/create/edit flow.
- Acceptance: domain entities, use cases, adapters and MobX store stay feature-scoped.
- Edge cases: duplicate topic names, validation errors, empty state and stale data.

## Ticket 4 - Source Binding Feature Slice
- Implement source selection and binding configuration.
- Acceptance: supported source capabilities are visible through domain-safe models.
- Edge cases: unsupported source, invalid config and source policy warnings.

## Ticket 5 - Feed And Summary Feature Slice
- Implement feed list, scan status, summary view and citation drill-down.
- Acceptance: loading, empty, error, stale and offline states are covered.
- Edge cases: summary exists for removed item, scan fails mid-refresh, citation target missing.

## No-Go Criteria
- DTOs are used as domain models.
- MobX stores contain business rules.
- Failure states are hidden from the user.
