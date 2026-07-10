# Frontend Live Development

Use one connected Flutter web debug runtime for local frontend work. The
canonical URL is `http://127.0.0.1:53217`; do not start neighboring instances
to make a change visible.

## Start The Runtime

From the repository root:

```sh
npm run frontend:run-connected-marionette
npm run frontend:watch-hot-reload
```

The runner performs an API preflight, starts `lib/main_marionette.dart`, writes
the Flutter PID file and prints the VM service URI used by Marionette.

## Apply Changes

For ordinary Dart UI, formatting and widget changes:

```sh
npm run frontend:hot-reload
```

For changes that must re-run application startup, including `main`, app
composition, `initState` assumptions, web assets and pubspec changes:

```sh
npm run frontend:hot-restart
```

The project commands signal the live `flutter run` process through the
Flutter tool. They do not build a release bundle and do not start another
server. The watcher chooses reload for ordinary Dart changes and restart for
startup, web and package changes.

## Marionette And DWDS

Do not call Marionette MCP `hot_restart` directly on Flutter web. During a web
restart, DWDS can dispose the active VM service before the Marionette request
returns. That leaves Marionette disconnected and can terminate the live debug
runtime or leave the browser on an indefinite loader.

The supported workflow is:

1. Run `npm run frontend:hot-restart`.
2. Read the VM service URI printed by the existing `flutter run` process.
3. Reconnect Marionette when the URI changed.
4. Verify the loaded route with Marionette and check Flutter logs for errors.

Marionette remains the visual and interaction verification layer. The Flutter
tool remains the lifecycle owner.

## Recovery

If the PID file is stale or the runtime is gone, stop the stale watcher and
start the canonical runtime again. Do not use a second port as a recovery
mechanism. Confirm both endpoints before debugging UI state:

```sh
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:53217/summaries
```
