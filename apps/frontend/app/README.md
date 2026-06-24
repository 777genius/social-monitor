# Social Monitor Flutter App

This package is the Social Monitor web-first Flutter app shell. It owns app-level routing, feature registration, runtime composition, theme mode, workspace/session context, and the top-level responsive shell.

The app is no longer the default Flutter template. Product workflows live in feature packages under `apps/frontend/features`, while shared frontend primitives live in `apps/frontend/packages`.

## Runtime Modes

- Demo mode uses demo composition and fixture-backed feature routes. It is useful for UI review and local frontend development without a backend.
- Connected mode uses `lib/main.dart` and `--dart-define` runtime config to connect feature routes to `social_monitor_generated_api`.
- If connected mode is missing API or workspace config, routes render a runtime-unavailable state instead of falling through to fake production data.

## Feature Routes

The app shell registers:

- `/auth` - session, tenant and workspace access
- `/topics` - monitoring intents and topic coverage
- `/sources` - source catalog, bindings, credentials health and scan state
- `/feed` - aggregated provider items, filters and review flows
- `/summaries` - briefings, digests and insight review workflows
- `/settings` - workspace governance, diagnostics and preferences

## Run Demo Mode

```sh
cd apps/frontend/app
fvm flutter run -d chrome --web-port=53217 -t lib/main_demo.dart
```

## Run Connected Mode

Start the backend API first, then run:

```sh
cd apps/frontend/app
fvm flutter run -d chrome --web-port=53217 \
  --dart-define=SOCIAL_MONITOR_API_BASE_URL=http://localhost:3000 \
  --dart-define=SOCIAL_MONITOR_TENANT_ID=tenant-demo \
  --dart-define=SOCIAL_MONITOR_WORKSPACE_ID=workspace-demo \
  --dart-define=SOCIAL_MONITOR_USER_ID=user-demo
```

Replace the demo ids with ids from the workspace you are running against.

Optional defines:

```sh
--dart-define=SOCIAL_MONITOR_TENANT_NAME="Current tenant"
--dart-define=SOCIAL_MONITOR_WORKSPACE_NAME="Current workspace"
--dart-define=SOCIAL_MONITOR_WORKSPACE_ROLE=admin
--dart-define=SOCIAL_MONITOR_USER_LABEL="MVP Operator"
--dart-define=SOCIAL_MONITOR_CORRELATION_ID=frontend-generated-api-session
--dart-define=SOCIAL_MONITOR_API_BEARER_TOKEN=your-token
```

The backend `.env.example` allows `http://localhost:53217` by default, so keep `--web-port=53217` unless CORS config changes.

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
