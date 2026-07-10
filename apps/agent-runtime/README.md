# Agent Runtime Service

Internal gRPC boundary between Social Monitor summary adapters and
`@vioxen/subscription-runtime`. The dependency is vendored as
`vendor/vioxen-subscription-runtime-0.1.0-main.2.tgz` so Docker and `npm ci`
install the CLI binary deterministically.

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
`@vioxen/subscription-runtime`, while enforcing `gpt-5.5` and `xhigh` reasoning
before constructing the Codex worker. The CLI path can be overridden through
`AGENT_RUNTIME_CLI_PATH`. Docker stores runtime session state in
`/var/lib/subscription-runtime` via `AGENT_RUNTIME_STATE_ROOT`.

Important env:

- `AGENT_RUNTIME_GRPC_BIND`, default `0.0.0.0:50052`
- `AGENT_RUNTIME_SERVICE_TOKEN`, optional bearer token for gRPC calls
- `AGENT_RUNTIME_CLI_PATH`, default `node_modules/.bin/subscription-runtime-run-agent-task`
- `AGENT_RUNTIME_STATE_ROOT`, durable subscription-runtime state root
- `AGENT_RUNTIME_LOCAL_ENCRYPTION_KEY_FILE`, local file containing the base64
  32-byte key used to decrypt durable subscription-runtime sessions
- `AGENT_RUNTIME_PROVIDER`, `codex` or `claude`, selected by Social Monitor
- `AGENT_RUNTIME_MODEL`, required production model (`gpt-5.5`)
- `AGENT_RUNTIME_REASONING_EFFORT`, required production effort (`xhigh`)
- `AGENT_RUNTIME_TIMEOUT_MS`, generic Social Monitor task timeout fallback
- `AGENT_RUNTIME_CODEX_AUTH_JSON_PATH`
- `AGENT_RUNTIME_CLAUDE_TOKEN_ENV`, default `CLAUDE_CODE_OAUTH_TOKEN`

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
