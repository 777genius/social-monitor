# Iteration 00 / Phase 03 - Architecture Standards

## Objective

Establish coding and architectural standards enforced by tooling.

## Steps

1. Define Clean Architecture layers: domain, application, adapters, interface/API, composition root.
2. Define ports: repositories, source providers, AI providers, clock, id generator, unit of work, auth, telemetry.
3. Define adapter types: Postgres, Redis, RabbitMQ, HTTP provider, OpenAI, WebSocket, generated API client.
4. Define import rules with Nx tags.
5. Define DTO mapping rules: DTO -> command/query -> use case -> response DTO.
6. Define error contract: Problem Details.
7. Define event envelope: CloudEvents-inspired metadata.

## Layer Rules

1. `domain` owns entities, value objects, domain services, policies, invariants and domain events. It imports no NestJS, ORM, generated DTO, broker, HTTP client or Flutter code.
2. `application` owns use cases, command/query handlers, port interfaces, transactions by abstraction and orchestration. It may depend on domain and shared primitives only.
3. `adapters` own persistence, provider clients, message brokers, AI clients, cache, WebSocket, OpenAPI clients and DTO mapping.
4. `interfaces` own REST controllers, WebSocket gateways, CLI/admin entrypoints and request/response DTOs.
5. `composition` wires modules, dependency injection, configuration and runtime-specific concerns.
6. Cross-layer mapping is explicit: request DTO -> command/query -> use case -> domain/application result -> response DTO.

## Port Design Rules

1. Create ports from use-case needs, not from infrastructure vendor APIs.
2. Keep ports narrow: `SourceProviderPort.search()` can be source-aware by capability profile, but must not expose provider DTOs.
3. Repository ports require tenant/workspace scope in method signatures for tenant data.
4. External-cost ports require quota preflight and usage telemetry path.
5. Time-sensitive use cases depend on `Clock`, not direct system time.
6. Idempotent use cases accept idempotency key, correlation id and retry context explicitly.

## NestJS Monorepo Rules

1. Use modules/libs to represent bounded contexts before physical services.
2. Use Nx/import tags or equivalent lint rules to prevent domain importing adapters/interfaces.
3. Keep shared kernel small: IDs, Result/Either, Clock, pagination primitives, error primitives and tenant scope.
4. Do not put provider SDKs, Prisma models, generated DTOs or Nest decorators in shared kernel.
5. Each runtime app has a composition root; domain/application code does not know whether it runs in API, worker or realtime app.
6. Physical microservice extraction requires the master plan service-boundary checklist.

## Backend Feature-Sliced Rules

1. Use `contexts/<bounded-context>/features/<use-case>` for vertical application slices.
2. Do not use a global backend `features` folder for business features; it blurs bounded context ownership.
3. A feature slice may contain command/query/result/use-case/spec files.
4. A feature slice may depend on context `domain`, context `ports` and shared kernel.
5. A feature slice must not depend on `adapters`, `interfaces`, NestJS decorators, Prisma models, broker clients or provider SDKs.
6. A new user/system operation should normally be added as a new feature slice before adding a new context.
7. If a feature needs another context's data, use a published event, read model, public application contract or explicitly approved anti-corruption adapter.
8. Feature tests use fake ports and should not boot NestJS unless the behavior being tested is interface/composition wiring.

## DRY And Abstraction Rules

1. Do not make a generic social provider abstraction that hides materially different source semantics.
2. Prefer duplicated small adapter mappers over a shared mapper that leaks provider concepts.
3. Share policy primitives only after two or more contexts need the same invariant and tests prove it is truly common.
4. Keep source-specific behavior in provider adapters and capability profiles.
5. Avoid “common” folders unless ownership, allowed dependencies and deletion rules are explicit.
6. Refactor duplication only when it reduces real maintenance risk without weakening boundaries.

## Edge Cases

- Generated DTO leaks into domain.
- Prisma model used as domain entity.
- Provider response stored as canonical object.
- Controller starts transaction directly.
- Shared kernel starts containing provider, ORM or UI code.
- A port mirrors a vendor SDK and locks the domain to one provider.
- A module is extracted into a service before contracts and failure modes are stable.
- DRY abstraction merges RSS, HN and future social APIs into an untestable generic provider.
- Feature slice imports Prisma, Nest controller, queue client or provider SDK directly.
- Global backend `features` folder starts hiding bounded-context ownership.

## Pay Attention

- SOLID is enforced through dependency direction, not slogans.
- DRY must not create premature generic abstractions across different source providers.
- Ports should be narrow and use-case driven.
- Modular monorepo is the default MVP runtime shape; physical services are earned by evidence.
- Composition roots can be Nest-specific; domain/application layers cannot.
- Boundary tests are part of architecture, not optional cleanup.
- Feature-Sliced backend organization is subordinate to DDD: context first, feature/use case second.

## Acceptance Criteria

- Layer rules documented.
- Forbidden imports list exists.
- Error and event contract shapes are documented.
- Tooling plan exists for lint/boundary checks.
- Port design rules prevent provider/ORM/generated DTO leakage.
- Service extraction criteria are documented before any physical split.
- DRY guardrails are explicit enough to block unsafe generic source abstractions.
- Backend feature-slice rules are documented and enforceable with import-boundary tests.
