# Agent Runtime Service

## Host release for the disabled systemd bridge

The host release is a tarball built from a clean product checkout. It
does not contain a `bridge.mjs`. Build on a Linux host with Node 22 or newer,
`tar`, the checked-in vendor archives, and the lockfile. The command runs the
existing Prisma codegen with a synthetic, nonconnecting database URL, compiles
the TypeScript build, and installs locked production dependencies in an
isolated temporary directory, and emits a tarball plus a separate JSON
provenance manifest in an output directory outside the checkout. It does not
start an agent or enable any unit.
Set `TMPDIR` to a writable scratch directory when the host's `/tmp` is
read-only; temporary installation files are removed after packaging.

```sh
node apps/agent-runtime/bin/host-release.mjs build --output-dir /tmp/agent-runtime-host-release
```

The extracted root has these exact entry paths:

- `dist/apps/agent-runtime/src/main.js` — Node service entrypoint.
- `apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs` — pinned CLI wrapper, with its pinned adjacent helper closure.
- `dist/libs/` — compiled Social Monitor libraries, including the generated gRPC contract.
- `node_modules/` — locked production dependencies, including the vendored
  `@vioxen/subscription-runtime` and pinned Codex native package. The wrapper's
  direct vendored import resolves to
  `node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js`.
- `package.json` and `package-lock.json` — root package metadata and lockfile.

The archive filename includes its Linux CPU architecture. The JSON manifest
records equal `sourceCommit` and `productCommit` pins, the target architecture,
`entry`, `cli`, `helpers`, each helper SHA-256, the archive SHA-256, wrapper
SHA-256, lockfile SHA-256, and a canonical hash of all extracted file bytes,
modes, paths and symlink targets. Copy the manifest and archive together over
an authenticated channel. Platform infra must pin
the intended product commit independently; a manifest supplied with an
untrusted archive is not itself an authority for that commit.

Before extracting, verify the archive SHA-256 and expected product commit
against the trusted manifest. Extract as root into a **new, empty** staging
directory and verify against the product checkout's verifier pinned to the
same reviewed source commit:

```sh
approved_commit="${APPROVED_PRODUCT_COMMIT:?set the reviewed product commit}"
service_uid="${AGENT_RUNTIME_SERVICE_UID:?set the numeric systemd service UID}"
archive="/opt/social-monitor/releases/agent-runtime-host-${approved_commit}-linux-$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/').tar.gz"
manifest="${archive}.json"
node apps/agent-runtime/bin/host-release.mjs verify-archive \
  --manifest "$manifest" --archive "$archive" \
  --expect-product-commit "$approved_commit"
mkdir /opt/social-monitor/agent-runtime-stage
tar -xzf "$archive" -C /opt/social-monitor/agent-runtime-stage --no-same-owner
node apps/agent-runtime/bin/host-release.mjs verify \
  --release-dir /opt/social-monitor/agent-runtime-stage \
  --manifest "$manifest" --archive "$archive" \
  --expect-product-commit "$approved_commit" \
  --service-uid "$service_uid"
```

The verifier rejects a wrong archive hash, product commit, missing helper,
changed extracted bytes, forbidden `.env`/`.git`/test/fixture paths, and a
symlink that leaves the extracted tree. It also rejects release entries owned
by the target service UID or writable by group/other. Keep the verified
release owned by root; its archived directories and files have no group or
other write bits.
The systemd service UID must be non-root and must receive write access only to
separate state, logs and auth-pool mounts. Set `AGENT_RUNTIME_CLI_PATH` to the absolute
extracted wrapper path. Start Node with the absolute extracted entrypoint and
the release root as working directory; `node_modules` resolution and the
wrapper's relative vendored import depend on this layout. The auth pool,
local encryption key and state root are operator-managed external paths and
must never be copied into the release.

For a verified release at `/opt/social-monitor/agent-runtime-current`, the
systemd bridge's paths are:

```ini
WorkingDirectory=/opt/social-monitor/agent-runtime-current
ExecStart=/usr/bin/node /opt/social-monitor/agent-runtime-current/dist/apps/agent-runtime/src/main.js
Environment=AGENT_RUNTIME_CLI_PATH=/opt/social-monitor/agent-runtime-current/apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs
```

The release command requires working `npm ci` and `npm run build` in the clean
product checkout. If its pinned lockfile or dependency installation fails,
no archive should be promoted. The synthetic packaging and verifier tests do
not start the service:

```sh
node --test apps/agent-runtime/bin/host-release*.test.mjs
```

Internal gRPC boundary between Social Monitor summary adapters and
`@vioxen/subscription-runtime`. The dependency is vendored as
`vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.3.tgz` so Docker and
`npm ci` install the CLI binary deterministically. The active artifact includes
the reviewed one-shot executor profile from upstream commit `5ff55dc2` (PR
#176). Provenance and packaging are proved by
`npm run vendor:subscription-runtime`; the usage contract itself is proved by
`npm run check:subscription-runtime-usage-contract`.

`vendor/vioxen-subscription-runtime-0.1.0-main.30.tgz` stays vendored because the
Reader Promotion V2 canary lane pins that release deliberately.

## Protocol

- Service: `social_monitor.agent_runtime.v1.AgentRuntimeService`
- RPCs: `RunAgentTask`, `CheckHealth`
- Contract: `libs/contracts/grpc/agent_runtime/v1/agent_runtime.proto`
- Social Monitor selects it with `SUMMARY_MODEL_PROVIDER=agent-runtime` or
  `READER_SUMMARY_MODEL_PROVIDER=agent-runtime`.

Social Monitor owns prompts, output schemas, validation and citation checks.
This service only executes a generic agent task and returns structured output.

## Runtime Bridge

The production executor calls the checked-in subscription-runtime bridge:

```sh
apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs --provider codex --input request.json --format result-json
```

The bridge delegates lifecycle, durable sessions and task execution to
`@vioxen/subscription-runtime`, while enforcing the exact purpose route before
constructing a one-shot Codex executor. Its writable `CODEX_HOME` is isolated
for the task and removed when the executor settles; agents cannot opt into
retention through a request or prompt. Active `social_monitor.reader_summary.*.v2`
routes use `gpt-5.6-sol` with `high` reasoning; structured routes use structured
JSON output, while `social_monitor.reader_summary.weekly.generate.v2` and the
dedicated `social_monitor.reader_summary.daily.canonical_recovery.v2` route use
`output_text`. Unversioned reader-summary purposes are retained only in frozen
historical evidence and are not admitted for execution. These admitted routes use Codex subscription-account auth from the
configured auth JSON; API-key credentials are removed from the runtime child
environment. The CLI path can be overridden through `AGENT_RUNTIME_CLI_PATH`.
Docker stores runtime session state in `/var/lib/subscription-runtime` via
`AGENT_RUNTIME_STATE_ROOT`.

Important env:

- `AGENT_RUNTIME_GRPC_BIND`, default `0.0.0.0:50052`
- `AGENT_RUNTIME_SERVICE_TOKEN`, optional bearer token for gRPC calls
- `AGENT_RUNTIME_CLI_PATH`, default `node_modules/.bin/subscription-runtime-run-agent-task`
- `AGENT_RUNTIME_STATE_ROOT`, durable subscription-runtime state root
- `AGENT_RUNTIME_LOCAL_ENCRYPTION_KEY_FILE`, local file containing the base64
  32-byte key used to decrypt durable subscription-runtime sessions
- `AGENT_RUNTIME_PROVIDER`, `codex` or `claude`, selected by Social Monitor
- `AGENT_RUNTIME_MODEL`, required production model (`gpt-5.6-sol`)
- `AGENT_RUNTIME_REASONING_EFFORT`, exact production service-admission baseline
  (`high`); purpose policy still selects the independent generic-summary
  profile as `xhigh`, while every admitted reader-summary v2 route uses `high`
- `AGENT_RUNTIME_TIMEOUT_MS`, generic Social Monitor task timeout fallback
- `AGENT_RUNTIME_CODEX_AUTH_JSON_PATH`
- `AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT`, immutable pool snapshot root
- `AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST`, manifest path inside the pool root
- `AGENT_RUNTIME_CLAUDE_TOKEN_ENV`, default `CLAUDE_CODE_OAUTH_TOKEN`

## Opt-in strict gRPC admission

Set `AGENT_RUNTIME_STRICT_PRODUCTION_ADMISSION=1` to enable strict admission.
The default remains compatible with existing source DO and Agent Teams callers.
Strict startup requires all of these explicit values:

- `AGENT_RUNTIME_SERVICE_TOKEN`: nonempty bearer token required by both RPCs.
- `AGENT_RUNTIME_GRPC_BIND`: numeric private or loopback IP and port; wildcard,
  public and hostname binds are rejected.
- `AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT`: existing absolute trusted project
  directory. Every `RunAgentTask.cwd` must name this directory or a descendant.
- `AGENT_RUNTIME_STATE_ROOT`: existing absolute directory on an operator-managed
  durable volume; `AGENT_RUNTIME_EPHEMERAL` must be disabled.
- `AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT` and
  `AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST`: existing absolute pool directory and
  manifest inside it with at least one account reference. Single-account auth
  paths are rejected in strict mode.
- `AGENT_RUNTIME_CLI_PATH`: existing absolute executable regular file with no
  symlink or traversal components. Startup also checks the pinned installation
  bytes and package identity.

The workspace, state and pool roots must be separate. The CLI must sit outside
the task workspace and state roots so admitted tasks cannot rewrite runtime
state, auth references or launcher bytes through their workspace.

Strict task admission rejects empty, relative, traversing, symlinked and
foreign-mounted cwd paths before execution. The trusted project root and
mounts must remain under operator control while tasks run; a mutable directory
tree can still change after admission. The gRPC server uses `createInsecure`,
so production strict mode also requires peer-only private transport and a
firewall that prevents untrusted peers from reaching the bind address. This
change does not enable strict mode in any deployment or compose configuration.

Operational invariant: production summary launchers append
`compose.agent-runtime-model.yml` last and idempotently recreate
`agent-runtime` before daily or weekly jobs, so the admitted model remains
`gpt-5.6-sol` even when host overlays are stale. This backend-owned document
also ensures the current main SHA receives the normal backend release
transaction, aligning `backend.sha`, the PostgreSQL runtime `READY` marker and
integration `HEAD` before bounded recovery.

For local development, `npm run start:agent-runtime` loads only the runtime
allowlist above from the repository `.env`; unrelated application credentials
are not copied into the child process. It also uses the standard local durable
state root under `XDG_STATE_HOME` (or `~/.local/state`) and the current
`~/.codex/auth.json` when no explicit Codex auth path is configured.

## Production Codex Auth Pool

Production uses the reviewed
`ops/deploy/production-runtime/compose.agent-runtime-model.yml` overlay. It
clears the legacy single-account auth path, mounts
`/var/data/social-monitor/auth-pool` read-only and points the bridge at the
immutable current manifest. `ops/deploy/host/refresh-codex-auth.sh` owns
atomic snapshot and manifest creation.

The manifest contract is:

```json
{
  "schemaVersion": 1,
  "snapshotId": "<immutable-generation>",
  "accounts": [
    {
      "id": "account-a",
      "relativePath": "snapshots/<immutable-generation>/account-a/auth.json"
    }
  ]
}
```

Both pool environment values must be configured together. When neither is
present, the bridge preserves the legacy single-account behavior. Local
startup does not auto-select `~/.codex/auth.json` when a pool is configured.

Run the deterministic bridge gate with:

```sh
npm run check:subscription-runtime-auth-pool-e2e
```

The gate creates a temporary sandbox project and fake auth snapshots, sends
one exact read-only task through the native subscription-runtime safe
executor, simulates quota on the first account and proves completion on the
second. It also verifies native workspace, sandbox, approval, tool-disable,
model and effort controls, and simulates refreshed materialized auth without
allowing writeback to the immutable pool snapshots. It never reads host Codex
auth or starts a real agent task.

The vendored runtime currently uses `outputSchemaName` to select structured
result parsing but sends `outputSchema: null` to native `turn/start`. This gate
does not claim native JSON-schema enforcement; that requires a reviewed
subscription-runtime artifact upgrade.

## Local Codex Compose

For a local production-like Codex runtime, use the checked-in auth override
instead of ad hoc `/tmp` compose files:

```sh
CODEX_AUTH_JSON_HOST_PATH="${HOME}/.codex/auth.json" \
docker compose -f docker-compose.yml -f docker-compose.agent-runtime-codex.yml \
  --profile app up -d --build agent-runtime
```

The override mounts the host Codex auth JSON at
`/run/secrets/codex-auth.json` and sets
`AGENT_RUNTIME_CODEX_AUTH_JSON_PATH` accordingly. The image itself installs
`@openai/codex` and CA certificates, so the container does not need a manual
Codex install step.

The health RPC probes `AGENT_RUNTIME_CLI_PATH --help`. It does not run an agent
task.
