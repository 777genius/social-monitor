# Getting started

[Back to README](../../README.md)

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

