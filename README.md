# [Social Monitor](https://social-monitor.app/)

<a href="https://discord.gg/MWmrv57Qkt"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Fv10%2Finvites%2FqtqSZSyuEc%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&label=Discord&logo=discord&logoColor=white&color=5865F2&style=flat-square&suffix=%20members" alt="Discord" /></a>
<a href="https://social-monitor.app/"><img src="https://img.shields.io/badge/Site-social--monitor.app-22C55E?style=flat-square&logo=googlechrome&logoColor=white" alt="Social Monitor Site" /></a>


Tired of scrolling through hundreds of near-identical posts across every social network just to find the few that actually matter?

I built Social Monitor because I was sick of the noise. Instead of drowning in duplicate takes, reposts, and filler from X, Reddit, news sites, and the rest, I wanted one tool that surfaces the posts that are genuinely interesting and tells me what actually happened.

## What it does

Social Monitor collects posts and signals from across social networks, news, and the web, then aggregates everything into one place. You connect and combine multiple sources, and instead of reading thousands of posts, you get a clear, to-the-point summary of the whole pile - no fluff, just what matters.

It ranks everything and builds a top-posts feed, so the most important and relevant content rises to the top automatically. And all of it is driven by your interests - you tell it what you care about, and it tunes what you see around that.

<img width="2178" height="1157" alt="image" src="https://github.com/user-attachments/assets/926b1651-0a48-496e-9d29-201d22edc7a6" />

## Summaries on your schedule

Don't want to check it constantly? Get a digest instead:

- Daily - what happened today, in one read
- Weekly - the big picture across the week
- Monthly - the trends and highlights that actually mattered

Stop consuming noise. See what's important.

<img width="1777" height="1157" alt="image" src="https://github.com/user-attachments/assets/39247c45-867c-4935-b4cc-114a17739627" />

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
- Analyst review surfaces for feed items, source health, summaries, and reader-summaries.
- Source connector experiments for APIs, feeds, webhooks, queues, and live provider checks.
- AI-assisted triage, summarization, clustering, relevance feedback, and evaluation pipelines.
- Internal tools for analysts, operators, support, and engineering teams.

## Project Status

This is an MVP implementation with substantial backend and frontend structure already in place.

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

Start the API locally in deterministic in-memory mode:

```sh
npm run start:api
```

Start the API locally in connected durable mode, which is the correct mode for
the Flutter `/summaries` screen and reader-summary review:

```sh
# Use another host port first if local 5432 is already occupied:
# export POSTGRES_PORT=55432
docker compose up -d postgres rabbitmq

POSTGRES_PORT="$(docker compose port postgres 5432 | awk -F: '{print $NF}')"
LOCAL_DATABASE_URL="postgresql://social_monitor:social_monitor_local_password@127.0.0.1:${POSTGRES_PORT:-5432}/social_monitor"

DATABASE_URL="$LOCAL_DATABASE_URL" npm run migrate:deploy
DATABASE_URL="$LOCAL_DATABASE_URL" npm run seed

DATABASE_URL="$LOCAL_DATABASE_URL" \
SUMMARY_PERSISTENCE=prisma \
FEED_PERSISTENCE=prisma \
RELEVANCE_PERSISTENCE=prisma \
SOCIAL_MONITOR_RUNTIME_PROFILE=local-dev \
TRUSTED_WORKSPACE_ROLE_HEADER=enabled \
SOCIAL_MONITOR_CORS_ORIGINS="http://127.0.0.1:53217,http://localhost:53217" \
npm run start:api
```

Use `docker compose port postgres 5432` instead of assuming `5432`; local
machines can remap the compose database to another host port, for example
`55432`. If another Postgres already listens on `127.0.0.1:5432`, export
`POSTGRES_PORT=55432` before `docker compose up`; otherwise Prisma can connect
to the host Postgres instead of the compose database.

Important: do not run connected `/summaries` with only
`SUMMARY_PERSISTENCE=prisma`. Reader summaries are loaded from summary
persistence, but coverage stats, collected post counts and top-read details use
the feed read model. If `FEED_PERSISTENCE` stays `in-memory`, the UI can show
citations while still showing `0 Posts`.

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

## First End-to-End Source Result

Fastest path: use a provider that does not need credentials. Start with
Hacker News, RSS or GitHub Trending Page.

1. Start the app profile:

   ```sh
   cp .env.example .env
   docker compose --profile app up -d --build
   ```

2. Create an interest:

   ```sh
   export API_BASE_URL=http://127.0.0.1:3000
   export TENANT_ID=00000000-0000-7000-8000-000000000901
   export WORKSPACE_ID=00000000-0000-7000-8000-000000000902

   curl -sS -X POST "$API_BASE_URL/interests" \
     -H "content-type: application/json" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-interest-openai" \
     -d '{"name":"OpenAI monitoring","query":"OpenAI developer tools"}'
   ```

3. Bind a source. Use the returned `interestId`:

   ```sh
   curl -sS -X POST "$API_BASE_URL/interests/<interestId>/source-bindings" \
     -H "content-type: application/json" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-bind-hn-openai" \
     -d '{"providerKey":"hacker-news","config":{"mode":"search","query":"OpenAI","maxItems":10}}'
   ```

4. Request a scan. Use the returned `sourceBindingId`:

   ```sh
   curl -sS -X POST "$API_BASE_URL/source-bindings/<sourceBindingId>/scan-requests" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-scan-hn-openai"
   ```

5. Check status and feed items. Use the returned `scanJobId`:

   ```sh
   curl -sS "$API_BASE_URL/scan-requests/<scanJobId>/status" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner"

   curl -sS "$API_BASE_URL/feed/items?limit=20" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner"
   ```

Open provider setup docs before enabling credentialed sources:

- `docs/providers/README.md` - provider matrix and end-to-end source setup.
- `docs/providers/hacker-news.md` - no account or key required.
- `docs/providers/rss.md` - no key required, but each binding needs a public feed URL.
- `docs/providers/github-trending-page.md` - no account or key required.
- `docs/providers/github-repo-radar.md` - needs Google Cloud BigQuery for full live mode.
- `docs/providers/github-issues.md` - manual-only, optional GitHub token, beta flag required in beta runtime.
- `docs/providers/reddit.md` - requires Reddit OAuth credentials for real data.
- `docs/providers/x-twitter.md` - private collector setup, dedicated research accounts only.
- `docs/providers/telegram.md` - deferred, no bindable runtime provider yet.

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
  --dart-define=SOCIAL_MONITOR_API_BASE_URL=http://127.0.0.1:3000 \
  --dart-define=SOCIAL_MONITOR_TENANT_ID=00000000-0000-7000-8000-000000000901 \
  --dart-define=SOCIAL_MONITOR_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 \
  --dart-define=SOCIAL_MONITOR_USER_ID=local-frontend-user \
  --dart-define=SOCIAL_MONITOR_WORKSPACE_ROLE=owner \
  --dart-define=SOCIAL_MONITOR_INITIAL_ROUTE=/summaries
```

Replace the demo ids with ids from the workspace you are running against.

The `/summaries` frontend route reads the reader-summary API. It is not the
legacy summary artifact list, so an empty legacy `/summaries` response does not
mean the reader-summary screen has no data. For local connected data, the API
and frontend must use the same tenant/workspace ids.

Optional connected-mode defines:

```sh
--dart-define=SOCIAL_MONITOR_TENANT_NAME="Current tenant"
--dart-define=SOCIAL_MONITOR_WORKSPACE_NAME="Current workspace"
--dart-define=SOCIAL_MONITOR_WORKSPACE_ROLE=admin
--dart-define=SOCIAL_MONITOR_USER_LABEL="MVP Operator"
--dart-define=SOCIAL_MONITOR_CORRELATION_ID=frontend-generated-api-session
--dart-define=SOCIAL_MONITOR_API_BEARER_TOKEN=<your-token>
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

Live connector checks are intentionally separated from `npm run verify` because
they can call external services and may require real accounts. See
`docs/providers/README.md` for the current provider matrix, credential setup and
per-provider live evidence commands.

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

Apache License 2.0. See [LICENSE](LICENSE).
