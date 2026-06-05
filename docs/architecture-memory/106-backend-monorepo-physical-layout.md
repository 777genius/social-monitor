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
application/
ports/
infrastructure/
presentation/
```

Rules:

- `domain` imports only shared kernel.
- `application` imports domain and ports.
- `infrastructure` implements ports and may import adapters.
- `presentation` maps REST/gRPC/messages to use cases.
- Apps compose modules; apps do not contain domain logic.

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
- adapters cannot be imported by domain/application except through ports;
- contracts are imported by presentation/infrastructure, not by domain entities.

## Best-Fact Choice

DDD/Clean Architecture needs automated boundary enforcement. Folder conventions alone will fail as the codebase grows.

