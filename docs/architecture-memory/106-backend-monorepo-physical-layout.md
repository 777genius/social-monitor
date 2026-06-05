# 106. Backend Monorepo Physical Layout

## Status

Locked for implementation blueprint.

## Research Anchors

- Nx enforce module boundaries: https://nx.dev/docs/guides/enforce-module-boundaries
- Nx mental model/project graph: https://nx.dev/concepts/mental-model
- NestJS modules: https://docs.nestjs.com/modules

## Decision

Use Nx as the monorepo enforcement layer and NestJS as the service/module runtime layer. Nx owns project graph and dependency rules; Nest owns dependency injection inside each deployable.

## Initial Layout

```text
apps/
  api-gateway/
  realtime-gateway/
  worker-ingestion/
  worker-intelligence/
  worker-notifications/
  scheduler/

libs/
  shared/
    kernel/
    observability/
    config/
    errors/
  contracts/
    openapi/
    proto/
    events/
  contexts/
    identity-tenancy/
    entitlements-billing/
    topic-management/
    source-management/
    scheduling/
    ingestion/
    content-intelligence/
    feed-search/
    notifications/
    audit-compliance/
  adapters/
    persistence-postgres/
    cache-redis/
    kafka/
    rabbitmq/
    object-storage/
    llm/
    sources/
      hacker-news/
      rss/
      reddit/
      x/
      telegram/
```

## Library Types

Each bounded context uses:

```text
domain/
features/
ports/
adapters/
interfaces/
```

Rules:

- `domain` imports only shared kernel.
- `features` are application/use-case slices and import only domain, ports and shared kernel.
- `ports` define repository/provider/broker/AI/clock/telemetry abstractions needed by features.
- `adapters` implement ports and may import infrastructure clients.
- `interfaces` maps REST/gRPC/messages/jobs/WS to feature use cases.
- Apps compose modules; apps do not contain domain logic.

## Backend Feature-Sliced Clean Architecture

Locked rule: backend uses DDD bounded contexts first, then feature/use-case slices inside each context.

Canonical context layout:

```text
libs/
  contexts/
    topic-management/
      domain/
        aggregates/
        value-objects/
        events/
        policies/
      features/
        create-topic/
          create-topic.command.ts
          create-topic.result.ts
          create-topic.use-case.ts
          create-topic.use-case.spec.ts
        disable-topic/
        list-topics/
      ports/
        topic.repository.port.ts
        domain-event-publisher.port.ts
      adapters/
        persistence/
      interfaces/
        rest/
        jobs/
        events/
```

Do not put Prisma repositories, Nest controllers, queue clients or provider SDKs inside `features/*`.

Feature slices are for application behavior. Domain model stays context-level; infrastructure stays in adapters; transport mapping stays in interfaces.

## Nx Tags

Use tags such as:

- `scope:identity`
- `scope:ingestion`
- `type:domain`
- `type:application`
- `type:adapter`
- `type:contract`
- `platform:backend`

Enforce:

- domain cannot depend on adapter;
- contexts cannot import another context's domain directly;
- adapters cannot be imported by domain/features except through ports;
- contracts are imported by interfaces/adapters, not by domain entities.

## Best-Fact Choice

DDD/Clean Architecture needs automated boundary enforcement. Folder conventions alone will fail as the codebase grows.
