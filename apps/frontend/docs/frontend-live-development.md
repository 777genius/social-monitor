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

### Check All Three Parts

Marionette needs three separate pieces. Check them before reporting it missing:

1. **App binding:** `app/pubspec.yaml` includes `marionette_flutter`, and
   `app/lib/main_marionette.dart` initializes `MarionetteBinding` in debug mode.
   This project already provides both, including custom design-system controls.
2. **MCP server:** the agent client must have an enabled Marionette stdio server.
   From `apps/frontend`, use `fvm dart pub global list` to check for
   `marionette_mcp`. If absent, follow the
   [official installation guide](https://pub.dev/packages/marionette_mcp).
   Install with the same Dart SDK and pub cache used by the configured server;
   an installation under another SDK/cache does not establish availability.
   The usual server command is the configured Dart executable with arguments
   `pub global run marionette_mcp`. Inspect only the Marionette configuration
   fields; never dump a client configuration file containing other credentials.
3. **Running debug app:** launch the command above on `127.0.0.1:53217`, then
   pass its exact VM service URI to Marionette's `connect` tool. Confirm the
   connection with `get_interactive_elements` and `get_logs` before UI checks.

If Marionette tools are absent from a chat, also check whether the server is
disabled, failed startup or is not installed. Reconnect/reload the agent client's
MCP integration after enabling it. Project support, server startup and a live
app connection are separate facts; report the specific missing piece.
The official [CLI alternative](https://marionette.leancode.co/docs/drive/#the-cli)
can drive the binding when the client cannot expose MCP tools. Browser screenshots
alone do not replace a Marionette check of the debug Flutter app.

### Reload And Restart

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

## Fixture-Only UI Checks

If the connected defines file is missing, that is an API configuration blocker,
not evidence that Marionette is unavailable. Do not copy production credentials
into a fixture or bypass the API preflight for a claimed connected check.

For isolated UI behavior, `app/lib/main_demo.dart` already initializes Marionette
and uses demo repositories. With no existing runtime on the canonical port, run
from `apps/frontend/app`:

```sh
fvm flutter run -d chrome --web-hostname=127.0.0.1 --web-port=53217 \
  -t lib/main_demo.dart --dart-define=SOCIAL_MONITOR_INITIAL_ROUTE=/summaries
```

Connect to its printed VM service URI and label the evidence as demo/fixture
behavior. This does not assess the relevance of production summary selections.
Keep this Flutter process as the lifecycle owner; use its `r`/`R` controls for
reload/restart. The connected-runtime signal helpers deliberately require the
`main_marionette.dart` entrypoint and must not be pointed at this demo process.

Demo mode intentionally does not seed collected summary evidence. The reusable
`features/summaries/test/support/top_posts_show_more_test_app.dart` fixture
starts with 12 Top cards, 6 more ranked cards and 7 separate news cards, visibly
labelled as synthetic data. It can be hosted by a temporary debug entrypoint
initializing `MarionetteBinding`; never add it to production routing. Flutter web
rebases entrypoints outside `lib/` under `org-dartlang-app:/`; DWDS rejects
absolute `file:` imports. Keep imports resolvable through package URIs or the
compiler's configured filesystem roots.

The fixture host belongs to the summaries feature, beside its test support;
the app package must not import feature test internals. From `apps/frontend/app`,
include the summaries root so the host's relative test imports resolve on web:

```sh
fvm flutter run -d chrome --web-hostname=127.0.0.1 --web-port=53217 \
  --filesystem-root="$(cd ../features/summaries && pwd)" \
  -t ../features/summaries/test_driver/top_posts_marionette.dart
```

If changing the entrypoint/root produces `The Dart compiler exited unexpectedly`,
inspect the compiler invocation and its exact `--initialize-from-dill` cache.
Preserve that owned cache before retrying compilation without it; do not erase
SDK caches, source files or unrelated runtime state. A DWDS `AbsoluteImportUriError`
is an import mapping problem, not a Marionette connection failure.

## Recovery

If the PID file is stale or the runtime is gone, stop the stale watcher and
start the canonical runtime again. Do not use a second port as a recovery
mechanism. Confirm both endpoints before debugging UI state:

```sh
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:53217/summaries
```
