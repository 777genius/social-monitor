# 226 - NestJS Monorepo Module Boundaries

## Decision

Use a TypeScript monorepo with NestJS applications and shared libraries, but enforce architectural boundaries with Nx-style project tags and lint rules.

NestJS modules alone are not enough to preserve DDD/Clean Architecture boundaries at scale.

## Sources

- NestJS workspaces/monorepo: https://docs.nestjs.com/cli/monorepo
- NestJS modules: https://docs.nestjs.com/modules
- NestJS providers: https://docs.nestjs.com/providers
- Nx enforce module boundaries: https://nx.dev/docs/features/enforce-module-boundaries

## Target Layout

```text
apps/
  api-service/
  worker-service/
  realtime-service/
  ai-service/
libs/
  shared/kernel/
  shared/config/
  shared/observability/
  bounded-contexts/topic-management/
  bounded-contexts/source-management/
  bounded-contexts/ingestion/
  bounded-contexts/summary/
  integrations/reddit/
  integrations/hacker-news/
  integrations/rss-atom/
  infrastructure/postgres/
  infrastructure/rabbitmq/
  infrastructure/kafka/
```

Apps are composition roots. Context libraries contain domain, feature/use-case slices, ports, adapters and interfaces.

## Library Tags

Use multi-dimensional tags:

```text
scope:shared
scope:topic
scope:source
scope:ingestion
scope:summary
scope:integration
scope:infra

type:domain
type:feature
type:port
type:adapter
type:interface
type:contract
type:test
```

## Import Rules

Domain may import:

- same bounded-context domain
- shared kernel

Domain must not import:

- NestJS framework decorators
- infrastructure packages
- generated API clients
- database clients
- broker clients

Feature/use-case slices may import:

- same bounded-context domain
- ports/contracts
- shared kernel

Adapters may import:

- context ports
- infrastructure clients
- provider SDKs

Apps may import:

- all needed modules for composition
- no domain logic of their own

## NestJS Module Role

NestJS modules wire dependencies and expose providers.

They do not define business boundaries by themselves. The real boundary is:

```text
bounded context package + import constraints + port contracts + tests
```

## Composition Rule

Only application/service apps bind concrete adapters:

```text
SourceProviderPort -> RedditProviderAdapter
SourceItemRepositoryPort -> PostgresSourceItemRepository
SummaryModelPort -> OpenAiSummaryModelAdapter
```

Feature/use-case slices export use-case providers but should not decide production infrastructure.

## CI Enforcement

CI must run:

- TypeScript build
- lint with module boundary rules
- dependency graph validation
- circular dependency check
- architecture smoke tests for forbidden imports

Pull requests that add a cross-context import need either a shared contract or an ADR.

## Anti-Patterns

- `common` library that becomes a dumping ground.
- importing repositories directly into controllers.
- feature modules importing another feature's infrastructure.
- sharing ORM entities as domain objects.
- putting business rules in NestJS controllers.
- using global modules for convenience.
- using a global backend `features` folder that hides bounded-context ownership.
- putting Prisma repositories, provider SDKs or queue clients inside `features/*`.

## Architecture Rule

The monorepo is for coordinated evolution, not for free imports.

If a dependency would be wrong across deployed microservices, it is also wrong inside the monorepo.
