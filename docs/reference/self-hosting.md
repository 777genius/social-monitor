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

Choose **configure later** (the default) to open the application and collect
RSS/HN without AI credentials. You can also run `./start.sh --without-ai`.
The AI worker stays stopped and no model requests are made.

For AI summaries, run `./start.sh --configure`. The current pipeline requires an
**OpenRouter API key** for its Jev content-scoring stage. Setup asks silently;
only the intelligence worker receives this key. Choose the text-generation
connection separately:

- **Codex**: reuse the local `CODEX_HOME/auth.json` (normally
  `~/.codex/auth.json`), or complete device-code login using the CLI already
  bundled in the image. The runtime policy determines the supported model.
- **Existing agent-runtime**: supply its gRPC address and service token. It must
  implement the Social Monitor scoring and reader-summary contract, not just
  an OpenAI-compatible chat endpoint. `localhost` inside Docker refers to the
  container; use the runtime's reachable hostname.

For Codex device login, enable device-code authentication in your account or
workspace settings if required. See [official authentication documentation](https://learn.chatgpt.com/docs/auth#login-on-headless-devices).

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
./start.sh --configure             # change AI connection, preserve storage keys
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

For unattended startup with existing Codex authorization:

```sh
./start.sh --no-open --ai codex --codex-auth-file /absolute/private/auth.json \
  --openrouter-key-file /absolute/private/openrouter-key
```

The file is mounted read-only. Setup does not read or copy its contents. The
runtime's existing single-account pool adapter handles AI requests.

For an external runtime, provide its token through a private file:

```sh
./start.sh --no-open --ai external \
  --runtime-address runtime.example.test:50052 \
  --runtime-token-file /absolute/private/runtime-token \
  --openrouter-key-file /absolute/private/openrouter-key
```

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
