# Social Monitor Flutter App

This package is the Social Monitor web-first Flutter app shell. It owns app-level routing, feature registration, runtime composition, theme mode, workspace/session context, and the top-level responsive shell.

The app is no longer the default Flutter template. Product workflows live in feature packages under `apps/frontend/features`, while shared frontend primitives live in `apps/frontend/packages`.

## Runtime Modes

- Demo mode uses demo composition and fixture-backed feature routes. It is useful for UI review and local frontend development without a backend.
- Connected mode uses `lib/main.dart` and `--dart-define` runtime config to create `social_monitor_generated_api`, then restores the user/workspace session from the backend.
- If connected mode is missing API or auth config, routes render a runtime-unavailable state instead of falling through to fake production data.

## Feature Routes

The app shell registers:

- `/auth` - session, tenant and workspace access
- `/interests` - monitoring intents and topic coverage
- `/sources` - source catalog, bindings, credentials health and scan state
- `/feed` - aggregated provider items, filters and review flows
- `/summaries` - reader-summaries, digests and insight review workflows
- `/settings` - workspace governance, diagnostics and preferences

## Run Demo Mode

```sh
cd apps/frontend/app
fvm flutter run -d chrome --web-port=53217 -t lib/main_demo.dart
```

Run demo mode from this app package, or from the repository root with `npm run frontend:run-demo`. Running `main_demo.dart` from the frontend workspace root does not use `app/pubspec.yaml`, so Flutter web can miss Material Icons font assets.

## Run Connected Mode

Start the backend API first in durable connected mode from the repository root:

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

If another Postgres already listens on `127.0.0.1:5432`, export
`POSTGRES_PORT=55432` before `docker compose up`; otherwise Prisma can connect
to the host Postgres instead of the compose database.

Then run the Flutter app from this package:

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

The app restores the user id, selected workspace, workspace role and workspace list from `GET /auth/session`.

The `/summaries` route is backed by reader summaries. Reader-summary content
comes from `SUMMARY_PERSISTENCE`, while collected post counts, provider coverage
and top-read details come from `FEED_PERSISTENCE`. Keep both on `prisma` for
connected local review; otherwise the screen can show real citations but
`0 Posts`.

Demo mode uses fixture-backed feature routes and can intentionally show no real
workspace summaries.

Optional defines:

```sh
--dart-define=SOCIAL_MONITOR_CORRELATION_ID=frontend-generated-api-session
--dart-define=SOCIAL_MONITOR_API_BEARER_TOKEN=your-user-jwt
```

The backend `.env.example` allows `http://localhost:53217` by default, so keep `--web-port=53217` unless CORS config changes.

## Run Connected Marionette Web

For Marionette-driven frontend review, run from the repository root:

```sh
npm run frontend:run-connected-marionette
```

This starts `lib/main_marionette.dart`, writes a Flutter tool pid file to `/tmp/social-monitor-flutter-web.pid`, and keeps the web app on `http://127.0.0.1:53217` by default.

Use the exact `Debug service listening on ws://.../ws` URI printed by Flutter when connecting Marionette. Do not connect to a neighboring listen port.

For full restart on Flutter web, prefer the Flutter tool path:

```sh
npm run frontend:hot-restart
```

Marionette `hot_reload` is fine for reloadable Dart edits. Marionette `hot_restart` on Flutter web currently goes through DWDS and can fail before the first Flutter-tool restart.

## Checks

From `apps/frontend`:

```sh
fvm flutter analyze
fvm flutter test app
fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart
```

From the repository root:

```sh
npm run check:frontend
```

## Ownership Boundaries

- `app` owns routing, shell layout and composition.
- Feature packages own product workflows and expose route entrypoints only.
- `design_system` owns reusable UI primitives and headless wrappers.
- `shared_kernel` owns framework-neutral frontend runtime primitives.
- `generated_api` owns REST transport and generated API client boundaries.

Do not put feature business logic, generated DTO mapping, or raw route parsing in the app shell.
