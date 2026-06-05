# Iteration 01 - Edge Case Playbook

## Scenario - Local Infrastructure Starts Flakily

- Signal: Services fail on fresh checkout or start in wrong order.
- Validate: Run clean boot and health checks.
- Mitigation: Add health dependencies, retry startup and clear env templates.

## Scenario - Domain Imports Infrastructure

- Signal: Domain references NestJS, ORM, broker or DTO types.
- Validate: Architecture import tests.
- Mitigation: Move framework code into adapters and expose ports.

## Scenario - Migration Applies Partially

- Signal: Schema differs between local and CI.
- Validate: Run migrations from empty database and rollback path review.
- Mitigation: Split migration, add transaction where safe, document manual recovery.

## Scenario - OpenAPI Drift

- Signal: Mobile generated client fails after backend change.
- Validate: OpenAPI diff and client generation.
- Mitigation: Use additive change or versioned response shape.
