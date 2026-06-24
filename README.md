# Social Monitor

Social Monitor is a monitoring platform for public social, news, and web signals. It combines a TypeScript/NestJS backend, durable worker runtime, generated API contracts, and a web-first Flutter frontend for analyst and operator workflows.

The project is built for teams that need to collect public signals, normalize them into reliable events, search and analyze them, review feed items, generate summaries or briefings, and route important findings into alerts, reports, dashboards, or downstream AI workflows.

## What Is In This Repo

- Backend API and workers for monitoring, ingestion, feed, summaries, delivery, identity, usage, relevance, and observability.
- Durable local runtime with PostgreSQL, RabbitMQ, Redis, Prisma migrations, event relay, and app-profile Docker Compose services.
- Flutter frontend workspace with an app shell, responsive design system, shared runtime contracts, generated API boundary, and DDD feature packages.
- Generated REST/mobile/frontend contracts and OpenAPI checks.
- Architecture memory, frontend playbooks, quality gates, and executable boundary tests.

Social Monitor is not a hosted SaaS in this repository. It is a full-stack MVP/reference implementation that you can run locally, extend, and adapt.

## What You Can Build With It

- Brand, product, creator, repository, or topic monitoring.
- News and media intelligence dashboards.
- Public web and social signal ingestion pipelines.
- Reputation, risk, and incident monitoring workflows.
- Analyst review surfaces for feed items, source health, summaries, and briefings.
- Source connector experiments for APIs, feeds, webhooks, queues, and live provider checks.
- AI-assisted triage, summarization, clustering, relevance feedback, and evaluation pipelines.
- Internal tools for analysts, operators, support, and engineering teams.

## Project Status

This is an MVP/reference implementation with substantial backend and frontend structure already in place.

Good fit today:

- Exploring the full-stack architecture and product direction.
- Running the backend API, workers, migrations, and local infrastructure.
- Running the Flutter app shell in demo mode.
- Wiring frontend feature slices to generated API runtime where backend contracts are available.
- Extending API, ingestion, feed, summaries, delivery, identity, relevance, observability, and frontend bounded contexts.

Not a good fit yet:

- Plug-and-play production deployment without review.
- Sensitive or regulated monitoring without your own legal, privacy, security, retention, and platform-policy controls.
- Assuming every architecture document is fully implemented in production code.
- Treating demo frontend data paths as production-ready integrations.

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
      summaries/        briefings, digests and insight review workflows
      settings/         workspace governance, diagnostics and preferences

libs/
  contracts/            REST/OpenAPI and generated client contracts
  delivery/             delivery domain and adapters
  feed/                 deduplicated feed read models and review flows
  identity/             tenants, workspaces, API keys and auth-related flows
  ingestion/            source providers, scan execution, cursors and feed projection
  monitoring/           scan requests and monitoring workflows
  relevance/            feedback, preference and relevance-learning flows
  summary/              summary jobs, artifacts, briefings, feedback and model adapters
  usage/                audit, quota and rate-limit controls
  platform/             shared platform utilities and infrastructure ports

docs/
  architecture-memory/  durable product and architecture decisions
  iterations/           implementation and planning notes

prisma/
  schema.prisma         database schema
  seed.ts               local seed script

test/
  e2e/                  end-to-end API tests
```

## Quick Start

Prerequisites:

- Node.js 22 or newer
- npm
- Docker and Docker Compose
- FVM with Flutter 3.41.9 for frontend work

Clone the repository:

```sh
git clone https://github.com/777genius/social-monitor.git
cd social-monitor
```

Install backend dependencies:

```sh
npm install
```

Create local environment config:

```sh
cp .env.example .env
```

Start local infrastructure only:

```sh
docker compose up -d
```

Validate database migrations and generate Prisma client:

```sh
npm run check:migrations
```

Start the API locally:

```sh
npm run start:api
```

Other backend entrypoints:

```sh
npm run start:ingestion
npm run start:intelligence
npm run start:delivery
npm run start:event-relay
```

Start the durable MVP app profile with API, workers, event relay, PostgreSQL and RabbitMQ:

```sh
docker compose --profile app up -d --build
```

The app profile runs a one-shot `migrate` service before starting the API and workers. Runtime selectors in `docker-compose.yml` use Prisma persistence, RabbitMQ command queues and the signed HTTP webhook delivery provider where available.

## Frontend Quick Start

Install or refresh Flutter workspace dependencies:

```sh
cd apps/frontend
fvm flutter pub get
```

Run the frontend in demo mode:

```sh
cd apps/frontend/app
fvm flutter run -d chrome --web-port=53217 -t lib/main_demo.dart
```

Run the frontend against a local API runtime:

```sh
cd apps/frontend/app
fvm flutter run -d chrome --web-port=53217 \
  --dart-define=SOCIAL_MONITOR_API_BASE_URL=http://localhost:3000 \
  --dart-define=SOCIAL_MONITOR_TENANT_ID=tenant-demo \
  --dart-define=SOCIAL_MONITOR_WORKSPACE_ID=workspace-demo \
  --dart-define=SOCIAL_MONITOR_USER_ID=user-demo
```

Replace the demo ids with ids from the workspace you are running against.

Optional connected-mode defines:

```sh
--dart-define=SOCIAL_MONITOR_TENANT_NAME="Current tenant"
--dart-define=SOCIAL_MONITOR_WORKSPACE_NAME="Current workspace"
--dart-define=SOCIAL_MONITOR_WORKSPACE_ROLE=admin
--dart-define=SOCIAL_MONITOR_USER_LABEL="MVP Operator"
--dart-define=SOCIAL_MONITOR_CORRELATION_ID=frontend-generated-api-session
--dart-define=SOCIAL_MONITOR_API_BEARER_TOKEN=your-token
```

The default `.env.example` CORS origin is `http://localhost:53217`, so keep `--web-port=53217` unless you update backend CORS config.

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

Live connector checks are intentionally separated from `npm run verify`: HN/RSS/GitHub public checks can run without credentials, while Reddit requires tenant-owned OAuth credentials. `capture:live-reddit-oauth` accepts either `REDDIT_ACCESS_TOKEN` or `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` + `REDDIT_REFRESH_TOKEN` and writes only redacted evidence artifacts. X/Twitter and Telegram remain deferred until an approved API/vendor or authorized channel path is available.

Summary feedback capture expects an already-redacted JSON input outside the git workspace. Set `SUMMARY_FEEDBACK_REDACTED_INPUT_PATH`, `SUMMARY_REAL_FEEDBACK_SAMPLES_PATH`, `SUMMARY_FEEDBACK_SOURCE_KIND`, `SUMMARY_FEEDBACK_ENVIRONMENT_ID`, `SUMMARY_FEEDBACK_OPERATOR`, `SUMMARY_FEEDBACK_REDACTED_BY`, `SUMMARY_FEEDBACK_APPROVED_BY`, `SUMMARY_FEEDBACK_COLLECTION_METHOD`, and either input `sampleWindow` or `SUMMARY_FEEDBACK_WINDOW_STARTED_AT` / `SUMMARY_FEEDBACK_WINDOW_ENDED_AT`.

## Architecture Docs

Start here for the backend and full-system architecture:

- `docs/architecture-memory/00-index.md`
- `docs/architecture-memory/100-architecture-summary.md`
- `docs/architecture-memory/101-bounded-context-map.md`
- `docs/architecture-memory/102-service-interface-contracts.md`
- `docs/architecture-memory/103-event-catalog-v1.md`

Start here for frontend architecture:

- `apps/frontend/AGENTS.md`
- `apps/frontend/docs/README.md`
- `apps/frontend/docs/frontend-implementation-plan.md`
- `apps/frontend/docs/frontend-ux-architecture.md`
- `apps/frontend/docs/frontend-state-playbook.md`
- `apps/frontend/docs/frontend-api-contract-playbook.md`
- `apps/frontend/docs/frontend-testing-strategy.md`

The architecture memory and frontend playbooks are intentionally detailed. They capture decisions around ingestion, monitoring, identity, delivery, observability, frontend routing, design-system boundaries, state, API mapping, data governance, AI evaluation, and production readiness.

## Responsible Use

Use this project only with data sources you are allowed to access and monitor. Social and web monitoring can affect privacy, safety, and platform policy compliance. Before using it in production, review source terms, data retention, user consent, legal basis, data minimization, credential handling, and internal access controls.

## License

MIT. See [LICENSE](LICENSE).
