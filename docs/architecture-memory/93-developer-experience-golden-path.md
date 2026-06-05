# 93. Developer Experience Golden Path

## Status

Locked for architecture baseline.

## Research Anchors

- Nx workspace generators: https://nx.dev/docs/reference/workspace/generators
- Development Containers specification: https://containers.dev/
- Docker Compose profiles: https://docs.docker.com/compose/how-tos/profiles/

## Decision

Create a golden path for adding features, connectors and services. Do not rely on engineers remembering the architecture manually.

## Local Development

Local dev must support three modes:

| Mode | Purpose | Required dependencies |
|---|---|---|
| `core` | API + Postgres + Redis + fake adapters | cheap default |
| `async` | core + Kafka + RabbitMQ + workers | event/job development |
| `full` | async + OpenSearch/vector/observability extras | integration work |

Use Docker Compose profiles for optional infrastructure. Use Dev Containers later if team onboarding needs a fully pinned environment.

## Generators

Nx generators should scaffold:

- backend bounded context module;
- application use case;
- port interface;
- adapter implementation;
- event schema;
- migration;
- test skeleton;
- OpenAPI/controller route if public;
- MobX presentation store for frontend feature.

Generated code must follow the repo's architecture boundaries by default.

## Fake Adapters

Every external source adapter needs:

- fake deterministic adapter for local dev;
- contract test fixture;
- provider adapter implementation;
- policy metadata: quotas, terms notes, credential requirements, rate limits.

No feature should require real Reddit/X/Telegram credentials to run normal unit tests.

## Onboarding Standard

New engineer should be able to run:

```bash
pnpm install
docker compose --profile core up
pnpm nx run-many -t test,lint
```

Flutter setup is separate but must use the same generated API contracts.

## Best-Fact Choice

Invest in generators early. DDD/Clean Architecture becomes expensive if every feature hand-rolls folder structure, dependency direction and test setup.

