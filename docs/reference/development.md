# Development reference

[Back to README](../../README.md)

## Tech Stack

Backend:

- TypeScript on Node.js 22+
- NestJS for application modules, REST APIs, and WebSocket-facing infrastructure
- Prisma for database schema, migrations, and persistence adapters
- PostgreSQL, RabbitMQ, Redis, and optional Kafka for local infrastructure
- Jest and Supertest for unit and end-to-end tests
- ESLint and custom architecture checks
- Clean Architecture and DDD-style bounded contexts

Frontend:

- Flutter 3.41.9 through FVM
- Dart workspaces under `apps/frontend`
- Web-first app shell with mobile-responsive constraints
- GoRouter for app-owned routing
- `modularity_flutter` for feature module boundaries
- Product `design_system` package wrapping headless UI primitives
- `shared_kernel` for typed async state, failures, route contracts, workspace scope, pagination, cache policy, action intent, realtime ordering, and observability primitives
- `generated_api` package for generated REST transport and Problem Details mapping
- Feature packages for auth, topics, sources, feed, summaries, and settings

## Repository Map

```text
apps/
  api-gateway/          REST API entrypoint
  delivery-service/     delivery and notification workflows
  event-relay/          outbox-to-broker relay for durable domain events
  ingestion-worker/     ingestion processing entrypoint
  intelligence-worker/  analysis and intelligence processing entrypoint
  frontend/
    app/                Flutter app shell, routing and composition root
    packages/
      design_system/    product UI wrappers, tokens and responsive primitives
      shared_kernel/    frontend runtime primitives and typed state
      generated_api/    generated REST client boundary
    features/
      auth/             session, tenant and workspace access flows
      topics/           monitoring intents, queries and topic coverage
      sources/          source catalog, bindings, credentials and scan state
      feed/             aggregated provider items, filters and review flows
      summaries/        reader-summaries, digests and insight review workflows
      settings/         workspace governance, diagnostics and preferences

libs/
  contracts/            REST/OpenAPI and generated client contracts
  delivery/             delivery domain and adapters
  feed/                 deduplicated feed read models and review flows
  identity/             tenants, workspaces, API keys and auth-related flows
  ingestion/            source providers, scan execution, cursors and feed projection
  monitoring/           scan requests and monitoring workflows
  relevance/            feedback, preference and relevance-learning flows
  summary/              summary jobs, artifacts, reader-summaries, feedback and model adapters
  usage/                audit, quota and rate-limit controls
  platform/             shared platform utilities and infrastructure ports

docs/
  architecture-memory/  durable product and architecture decisions
  providers/            per-provider setup for real source collection
  iterations/           implementation and planning notes

prisma/
  schema.prisma         database schema
  seed.ts               local seed script

test/
  e2e/                  end-to-end API tests
```

## Useful Commands

Backend and repository checks:

```sh
npm run build
npm run lint
npm run test
npm run test:e2e
npm run check:architecture
npm run check:code-quality
npm run check:runtime-compose
npm run check:runtime-profile-guards
npm run check:local-infra
npm run verify
```

Frontend checks:

```sh
npm run check:frontend
cd apps/frontend && fvm flutter analyze
cd apps/frontend && fvm flutter test app
cd apps/frontend && fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart
cd apps/frontend && fvm flutter test packages/design_system
cd apps/frontend && fvm dart test packages/shared_kernel packages/generated_api
```

Frontend generation and scaffolding:

```sh
npm run frontend:create-feature -- <bounded_context> "<Title>" "<Purpose>"
npm run frontend:generate-api
```

Live connector checks are intentionally separated from `npm run verify` because
they can call external services and may require real accounts. See
[docs/providers/README.md](../../docs/providers/README.md) for the current provider matrix, credential setup and
per-provider live evidence commands.

Summary feedback capture expects an already-redacted JSON input outside the git workspace. Set `SUMMARY_FEEDBACK_REDACTED_INPUT_PATH`, `SUMMARY_REAL_FEEDBACK_SAMPLES_PATH`, `SUMMARY_FEEDBACK_SOURCE_KIND`, `SUMMARY_FEEDBACK_ENVIRONMENT_ID`, `SUMMARY_FEEDBACK_OPERATOR`, `SUMMARY_FEEDBACK_REDACTED_BY`, `SUMMARY_FEEDBACK_APPROVED_BY`, `SUMMARY_FEEDBACK_COLLECTION_METHOD`, and either input `sampleWindow` or `SUMMARY_FEEDBACK_WINDOW_STARTED_AT` / `SUMMARY_FEEDBACK_WINDOW_ENDED_AT`.

## Architecture Docs

Start here for the backend and full-system architecture:

- [docs/architecture-memory/00-index.md](../../docs/architecture-memory/00-index.md)
- [docs/architecture-memory/100-architecture-summary.md](../../docs/architecture-memory/100-architecture-summary.md)
- [docs/architecture-memory/101-bounded-context-map.md](../../docs/architecture-memory/101-bounded-context-map.md)
- [docs/architecture-memory/102-service-interface-contracts.md](../../docs/architecture-memory/102-service-interface-contracts.md)
- [docs/architecture-memory/103-event-catalog-v1.md](../../docs/architecture-memory/103-event-catalog-v1.md)

Start here for frontend architecture:

- [apps/frontend/AGENTS.md](../../apps/frontend/AGENTS.md)
- [apps/frontend/docs/README.md](../../apps/frontend/docs/README.md)
- [apps/frontend/docs/frontend-implementation-plan.md](../../apps/frontend/docs/frontend-implementation-plan.md)
- [apps/frontend/docs/frontend-ux-architecture.md](../../apps/frontend/docs/frontend-ux-architecture.md)
- [apps/frontend/docs/frontend-state-playbook.md](../../apps/frontend/docs/frontend-state-playbook.md)
- [apps/frontend/docs/frontend-api-contract-playbook.md](../../apps/frontend/docs/frontend-api-contract-playbook.md)
- [apps/frontend/docs/frontend-testing-strategy.md](../../apps/frontend/docs/frontend-testing-strategy.md)

The architecture memory and frontend playbooks are intentionally detailed. They capture decisions around ingestion, monitoring, identity, delivery, observability, frontend routing, design-system boundaries, state, API mapping, data governance, AI evaluation, and production readiness.

## Responsible Use

Use this project only with data sources you are allowed to access and monitor. Social and web monitoring can affect privacy, safety, and platform policy compliance. Before using it in production, review source terms, data retention, user consent, legal basis, data minimization, credential handling, and internal access controls.

