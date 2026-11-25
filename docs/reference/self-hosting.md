# One-command local installation

This preview runs the existing Flutter application, API, collection workers and
AI pipeline on your own computer. It is a single-owner installation bound to
`127.0.0.1`, with one browser address. It uses PostgreSQL, Redis and RabbitMQ;
their ports and the backend port are private to the Docker network.

## Start

Install Docker Desktop, or Docker Engine with Compose **2.30+**. Both amd64 and
arm64 are supported. You need an internet connection and `curl` for the public
release download fallback. Node, npm, Dart and Flutter are not required on your
computer.

```sh
git clone https://github.com/777genius/social-monitor.git
cd social-monitor
./start.sh
```

The script loads precompiled backend and Flutter Web images. If the registry
requires authentication, it downloads the same compiled images from the public
GitHub preview release, checks SHA-256 and loads them into Docker. Subsequent
starts reuse the installed images.

Startup asks no questions and needs no AI credentials. It reuses your saved
configuration on later runs. Use `./start.sh --without-ai` to temporarily skip
AI if you have already connected it.

## Optional AI setup

You need two things for AI summaries:

1. An **OpenRouter API key** or an **OpenAI API key** with Decisions access for assessing and selecting collected content.
   Save it in a private text file containing only the key, outside this repository.
2. A **Codex login** for writing summaries. Sign in with the Codex CLI first
   (`codex login`). Its login file is usually `~/.codex/auth.json`.
   See [Codex authentication](https://learn.chatgpt.com/docs/auth#login-on-headless-devices)
   if you need to sign in on a machine without a browser.

Then run (replace the key-file path):

```sh
./start.sh --ai codex \
  --openrouter-key-file "$HOME/.config/social-monitor/openrouter-key" \
  --codex-auth-file "$HOME/.codex/auth.json"
```

OpenRouter SystemOne/Jev remains the default. To assess with OpenAI Decisions
using `gpt-6-luna`, select it explicitly and provide its key file:

```sh
docker build -t social-monitor-backend:decisions .
SELFHOST_BACKEND_IMAGE=social-monitor-backend:decisions \
./start.sh --local-images --ai codex --scoring-provider openai-decisions \
  --openai-key-file "$HOME/.config/social-monitor/openai-key" \
  --codex-auth-file "$HOME/.codex/auth.json"
```

Run this after the initial credential-free startup so the frontend image is
already installed. It builds the backend from the checked-out revision because
the pinned `selfhost-preview-20261018` backend image does not contain Decisions.
On later starts, keep the same `SELFHOST_BACKEND_IMAGE` override and
`--local-images` to reuse this backend. A published backend image containing
the integration can also be selected through `SELFHOST_BACKEND_IMAGE`.

Both scoring providers answer the same four reader-value questions. The
separate Codex service continues to write the final summaries. Setup saves the
selected scoring credential in the private scoring configuration and applies
the provider selection to the backend processes. Later starts reuse it.
Use only the key-file argument that matches the selected provider.

The Codex login file is mounted read-only; setup does not read or copy it.
These settings are saved privately; later starts need only `./start.sh`.
The launcher never prompts for secrets or starts a login flow. Missing settings
produce an error with a link to this guide. You can give this guide to your AI
coding assistant to help configure the files; do not paste secrets into chat.

Setup runs in the terminal, then opens **http://localhost:8080/feed** with collected
posts (or `/summaries` when AI is connected):
it creates a starter interest, enables 15-minute scans for Hacker News and
Simon Willison's RSS feed, collects content and requests the first daily
summary over the preceding 24 hours when AI is connected. RSS/HN do not require source accounts.
AI access is separate from source access. The first summary may take several
minutes; model access and publication quality checks remain enforced.

## Configuration and repeat starts

```sh
./start.sh                         # reuse configuration, data and first-run jobs
./start.sh --port 8090             # change browser port without rebuilding Flutter
./start.sh --stop                  # stop containers, preserve volumes and config
```

Private settings and generated credentials live in `.social-monitor/` with
directory mode `0700` and file mode `0600`. Back up this directory together
with the installation's Docker database volume. Deleting the configuration
loses the encryption keys and database credentials. The application owner
credential stays in the proxy; it is not compiled into browser assets.

Use an absolute external directory to keep installation state elsewhere:

```sh
./start.sh --state-dir "$HOME/.local/share/social-monitor" --port 8090
```

That path identifies an installation and its Docker volumes. Reuse the same
path when restarting or stopping it. Custom state directories inside the
repository are refused to keep secrets out of build contexts.

## Advanced: separate AI service

Most users can use the bundled Codex service described above. If you already
operate a separate Social Monitor AI service, supply its network address and
service password through a private file. In the CLI these are named
`--runtime-address` and `--runtime-token-file`. This is a server component that
runs AI jobs using the Social Monitor gRPC protocol. A generic chat API does not
implement that protocol.
The address must be reachable from Docker; container `localhost` is not your host.

```sh
./start.sh --no-open --ai external \
  --runtime-address runtime.example.test:50052 \
  --runtime-token-file /absolute/private/runtime-token \
  --openrouter-key-file /absolute/private/openrouter-key
```

## Advanced: scoring configuration

For deployments configured through environment variables, set
`READER_VALUE_SCORING_PROVIDER=openrouter-systemone` (the default) with
`OPENROUTER_API_KEY`, or `READER_VALUE_SCORING_PROVIDER=openai-decisions` with
`OPENAI_API_KEY`. Selection is explicit and does not depend on which keys exist.
Summary preparation does not need the scoring key; only the enabled assessment
worker requires its selected credential.

V3 scoring requires `RELEVANCE_PERSISTENCE=prisma`,
`SUMMARY_PERSISTENCE=prisma`, `READER_VALUE_SCORING_LOOP=enabled` and
`INTELLIGENCE_READER_SUMMARY_JOB_LOOP=enabled`. The workflow remains
`READER_VALUE_MODE=jev_primary_v3` with either provider; that historical mode
name describes the durable selection pipeline. Configure the existing
agent-runtime summary writer separately. The local launcher supplies these
prerequisites when AI is connected.

Use the same provider selection in the API/preflight, assessment worker and
durable capture processes. Before switching an existing deployment, finish its
frozen jobs using the previous selection, then update the processes together.
Requests and cached assessments retain their exact provider configuration and
hashes. Different selections cannot reuse or dispatch each other's inputs;
unmatched work can remain pending or fail a preparation/coverage check. There
is no cross-process startup handshake or automatic provider fallback.

Decisions currently returns token usage without billed cost. Its persisted
cost stays unknown; token counts do not represent a billing estimate.

## If setup stops

The command returns a failure if migration, collection or the first summary
fails. It does not report a rejected/empty summary as success. Existing data,
periods and job IDs are retained. Run the same command to resume observation;
it does not submit a new AI job merely because observation timed out.

An interrupted installer can leave an empty `start.lock` or `bootstrap.lock`
directory inside the private state directory. After confirming the previous
installer is no longer running, remove that empty lock directory and resume.
A terminal failed or quality-rejected job needs diagnosis; repeating startup
preserves its identity instead of spending more AI quota automatically.

This localhost profile rejects foreign browser origins and hostnames. Public
hosting and multiple owners use the existing production deployment and identity
configuration rather than this local owner proxy.

## Development and image publication

End users consume compiled images. Maintainers build them with `Dockerfile`
and `ops/quickstart/frontend.Dockerfile`; the latter runs the complete frontend
checks before compiling the web bundle. `selfhost-images.yml` builds native
amd64/arm64 archives. Publishing the immutable preview release is an explicit
workflow input after testing the exact revision.

For an isolated TEST installation using already built images:

```sh
SELFHOST_BACKEND_IMAGE=social-monitor-backend:TEST-quickstart \
SELFHOST_FRONTEND_IMAGE=social-monitor-web:TEST-quickstart \
./start.sh --local-images --no-open --ai codex \
  --codex-auth-file /absolute/private/auth.json \
  --openrouter-key-file /absolute/private/openrouter-key \
  --state-dir /absolute/TEST-social-monitor-state --port 38417
```
