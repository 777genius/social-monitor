# Iteration 01 - Engineering Kickoff Agenda

## Meeting Goal
Turn the foundation decisions into a buildable NestJS monorepo, contracts and local platform baseline.

## Required Attendees
- Backend lead.
- Platform/infra owner.
- Contract/API owner.
- QA owner.
- Mobile representative.

## Agenda
1. Confirm monorepo layout and shared library ownership.
2. Confirm domain/application/adapter boundaries.
3. Confirm database, migration and tenant-context strategy.
4. Confirm OpenAPI generation path.
5. Confirm outbox, idempotency and local infra scope.

## Decisions To Lock
- ORM and migration tool.
- Test pyramid baseline.
- Initial service/module boundaries.
- Outbox and event naming conventions.

## Edge Cases To Discuss
- A NestJS provider leaks into domain code.
- A shared package becomes a dumping ground.
- Local infra works but cannot map to production later.
- OpenAPI docs drift from controller behavior.

## First-Day Output
- Scaffold tickets are ready.
- Infra compose scope is clear.
- Contract generation owner is assigned.
- Boundary checks are defined.
