# Iteration 00 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent foundation work from becoming vague planning that cannot guide implementation.

## Forbidden Shortcuts
- Treating personal MVP as a reason to skip tenant modeling.
- Approving a source path without risk classification.
- Creating glossary terms that do not map to bounded contexts.
- Writing contract standards without examples.

## Architecture Anti-Patterns
- Context names based on technical layers instead of business capabilities.
- Source strategy hidden inside implementation notes.
- Contract rules that depend on a specific framework or SDK.
- Creating a physical microservice for every bounded context before contracts stabilize.
- Building a generic provider layer that erases real source differences and makes certification weak.
- Using shared/common modules as a shortcut around ports/adapters.
- Treating Kafka/RabbitMQ/gRPC as proof of architecture instead of enforcing dependency direction and failure handling.

## Product Anti-Patterns
- Expanding beyond the core loop before the loop is defined.
- Mixing future source dreams with MVP-supported source policy.
- Treating summary trust as optional.

## Stop Immediately If
- A source is approved without policy owner.
- Multi-tenancy is removed from the model.
- A contract rule cannot be converted into a ticket.
- A service split has no extraction checklist, rollback plan or consumer contract tests.
- A DRY refactor would move provider-specific behavior into domain/application code.
