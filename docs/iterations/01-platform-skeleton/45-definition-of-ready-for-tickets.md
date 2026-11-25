# Iteration 01 - Definition Of Ready For Tickets

## Ready Goal
Ensure platform tickets preserve Clean Architecture and do not create hidden coupling.

## Required Ticket Context
- Target module or bounded context.
- Layer: domain, application, adapter, infrastructure or API.
- Contract impact.
- Migration impact.
- Event/outbox/idempotency impact.

## Required Acceptance Checks
- Import boundaries are stated.
- Tests required by layer are listed.
- OpenAPI generation impact is known.
- Migration path covers clean and upgraded database states.
- Duplicate-command behavior is defined when commands write data.

## Required Edge Cases
- Crash after database write before publish.
- Missing tenant context.
- Duplicate command.
- Local infra stale state.

## Not Ready If
- Domain or application code would depend on NestJS, ORM, broker or DTOs.
- Outbox/idempotency is affected but not described.
- Contract change has no compatibility expectation.

## Ready Output
Ticket can be implemented as a scoped PR with clear boundary checks and repeatable verification.
