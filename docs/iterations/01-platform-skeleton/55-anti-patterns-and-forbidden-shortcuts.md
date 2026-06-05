# Iteration 01 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent platform scaffolding from creating coupling that later iterations must fight.

## Forbidden Shortcuts
- Putting business rules in controllers.
- Letting domain import NestJS, ORM, broker or DTO packages.
- Deferring outbox/idempotency until after workers exist.
- Manually editing generated OpenAPI.

## Architecture Anti-Patterns
- Shared libraries with no owner.
- ORM entities treated as domain entities.
- Events emitted without version, tenant scope or idempotency metadata.

## Product Anti-Patterns
- Optimizing infrastructure before the MVP loop needs it.
- Adding microservice deployment complexity before boundaries are proven.
- Hiding platform failures from local developers.

## Stop Immediately If
- Duplicate command creates duplicate durable effects.
- Migration cannot run repeatably.
- Ingestion would need to bypass application ports.
