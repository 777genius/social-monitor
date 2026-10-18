#!/usr/bin/env bash
# User host needs Docker Compose, curl and a POSIX shell; all build tools live in images.
set -euo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
STATE="$ROOT/.social-monitor"
PORT=8080
OPEN_BROWSER=1
LOCAL_IMAGES=0
STOP=0
DEFER_AI=0
AUTH_FILE=""
MODEL=""
MODE=""
ADDRESS=""
TOKEN=
SCORING_KEY=""
usage() {
  cat <<'HELP'
Usage: ./start.sh [--port 8080] [--state-dir PATH] [--no-open]
                  [--ai codex|external] [--model MODEL] [--codex-auth-file PATH]
                  [--runtime-address HOST:PORT] [--runtime-token-file PATH]
                  [--openrouter-key-file PATH]
                  [--local-images] [--stop] [--without-ai]
Default: start without AI and without questions; reuse existing configuration.
To connect AI, pass --ai codex, --openrouter-key-file and --codex-auth-file.
See docs/reference/self-hosting.md. --local-images never builds code.
HELP
}
die() { printf '%s\n' "$*" >&2; exit 1; }
while (($#)); do
  case "$1" in
    --port) PORT=${2:?Missing port}; shift 2 ;;
    --state-dir) STATE=${2:?Missing path}; shift 2 ;;
    --no-open) OPEN_BROWSER=0; shift ;;
    --local-images) LOCAL_IMAGES=1; shift ;;
    --stop) STOP=1; shift ;;
    --without-ai) DEFER_AI=1; shift ;;
    --ai) MODE=${2:?Missing AI mode}; shift 2 ;;
    --model) MODEL=${2:?Missing model}; shift 2 ;;
    --codex-auth-file) AUTH_FILE=${2:?Missing auth path}; shift 2 ;;
    --runtime-address) ADDRESS=${2:?Missing runtime address}; shift 2 ;;
    --runtime-token-file) TOKEN=$(cat -- "${2:?Missing token path}"); shift 2 ;;
    --openrouter-key-file) SCORING_KEY=$(cat -- "${2:?Missing key path}"); shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; die "Unknown option: $1" ;;
  esac
done
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$PORT > 0 && 10#$PORT < 65536)) || die 'Port must be 1–65535.'
command -v docker >/dev/null || die 'Install Docker Desktop or Docker Engine with Compose first.'
docker info >/dev/null 2>&1 || die 'Docker is not running or is not accessible to this user.'
VERSION=$(docker compose version --short)
VERSION=${VERSION#v}
IFS=. read -r MAJOR MINOR _ <<< "$VERSION"
[[ "$MAJOR" =~ ^[0-9]+$ && "$MINOR" =~ ^[0-9]+$ ]] || die 'Cannot determine Docker Compose version.'
((MAJOR > 2 || (MAJOR == 2 && MINOR >= 30))) || die 'Docker Compose 2.30 or newer is required.'
[[ ! -L "$STATE" ]] || die 'State directory must not be a symbolic link.'
mkdir -p -- "$STATE"
STATE=$(cd -- "$STATE" && pwd -P)
case "$STATE" in
  "$ROOT/.social-monitor") ;;
  "$ROOT"|"$ROOT/"*) die 'Custom state must be outside the repository to keep secrets out of build contexts.' ;;
esac
# The container helper checks ownership/mode before creating any secrets.
mkdir "$STATE/start.lock" 2>/dev/null || die 'Another start is active. If it crashed, remove only the empty start.lock directory.'
trap 'rmdir "$STATE/start.lock" 2>/dev/null || true' EXIT
export SELFHOST_STATE_DIR="$STATE" SELFHOST_PORT="$PORT"
export SELFHOST_UID="$(id -u)" SELFHOST_GID="$(id -g)"
export SELFHOST_BACKEND_IMAGE="${SELFHOST_BACKEND_IMAGE:-ghcr.io/777genius/social-monitor-backend:selfhost-preview-20261018}"
export SELFHOST_FRONTEND_IMAGE="${SELFHOST_FRONTEND_IMAGE:-ghcr.io/777genius/social-monitor-web:selfhost-preview-20261018}"
PROJECT="sm-$(printf '%s' "$STATE" | cksum | awk '{print $1}')"
COMPOSE=(docker compose --project-name "$PROJECT" --env-file "$STATE/compose.env" -f "$ROOT/ops/quickstart/compose.yml")
if ((STOP == 1)); then
  [[ -f "$STATE/compose.env" ]] || die 'This installation has not been configured.'
  "${COMPOSE[@]}" --profile '*' down
  printf 'Stopped. Configuration and database volumes were preserved.\n'
  exit 0
fi
if ((LOCAL_IMAGES == 0)) && ! docker image inspect "$SELFHOST_BACKEND_IMAGE" "$SELFHOST_FRONTEND_IMAGE" >/dev/null 2>&1; then
  if ! docker pull "$SELFHOST_BACKEND_IMAGE" || ! docker pull "$SELFHOST_FRONTEND_IMAGE"; then
    [[ "$SELFHOST_BACKEND_IMAGE" == ghcr.io/777genius/social-monitor-backend:selfhost-preview-20261018 && \
       "$SELFHOST_FRONTEND_IMAGE" == ghcr.io/777genius/social-monitor-web:selfhost-preview-20261018 ]] || die 'Pull failed for custom images.'
    printf 'Loading verified prebuilt images from the public release…\n'
    bash "$ROOT/ops/quickstart/load-release-images.sh" "$STATE"
  fi
elif ((LOCAL_IMAGES == 1)); then
  docker image inspect "$SELFHOST_BACKEND_IMAGE" "$SELFHOST_FRONTEND_IMAGE" >/dev/null
fi
if [[ ! -f "$STATE/settings.json" || -n "$MODE" ]]; then
  if [[ -z "$MODE" ]]; then MODE=codex; DEFER_AI=1; fi
  [[ "$MODE" == codex || "$MODE" == external ]] || die 'AI mode must be codex or external.'
  if [[ "$MODE" == external ]]; then
    [[ -n "$ADDRESS" && -n "$TOKEN" ]] || die 'External AI service requires --runtime-address and --runtime-token-file. See docs/reference/self-hosting.md.'
  fi
  if ((DEFER_AI == 1)); then SCORING_KEY=""
  else [[ -n "$SCORING_KEY" ]] || die 'AI requires --openrouter-key-file PATH. See docs/reference/self-hosting.md.'; fi
  printf '%s\n' "$MODE" "$MODEL" "$ADDRESS" "$TOKEN" "$SCORING_KEY" |
    docker run --rm -i --user "$SELFHOST_UID:$SELFHOST_GID" -v "$STATE:/state" \
      "$SELFHOST_BACKEND_IMAGE" node dist/scripts/quickstart/setup.js
else
  docker run --rm -i --user "$SELFHOST_UID:$SELFHOST_GID" -v "$STATE:/state" \
    "$SELFHOST_BACKEND_IMAGE" node dist/scripts/quickstart/setup.js </dev/null
fi
unset TOKEN SCORING_KEY
MODE=$(sed -n 's/^SELFHOST_AI_MODE=//p' "$STATE/compose.env")
AI_ENABLED=$(sed -n 's/^SELFHOST_AI_ENABLED=//p' "$STATE/compose.env")
if ((DEFER_AI == 1)); then AI_ENABLED=false; fi
if [[ "$AI_ENABLED" == true ]]; then COMPOSE+=(--profile ai); fi
if [[ "$MODE" == codex && "$AI_ENABLED" == true ]]; then
  if [[ -z "$AUTH_FILE" && -f "$STATE/codex-auth-path" ]]; then AUTH_FILE=$(cat "$STATE/codex-auth-path"); fi
  if [[ -z "$AUTH_FILE" && -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ]]; then AUTH_FILE="${CODEX_HOME:-$HOME/.codex}/auth.json"; fi
  [[ -n "$AUTH_FILE" ]] || die 'Sign in with Codex first, then pass --codex-auth-file PATH. See docs/reference/self-hosting.md.'
  [[ -f "$AUTH_FILE" && -r "$AUTH_FILE" ]] || die 'Codex auth file must exist and be readable.'
  AUTH_FILE="$(cd -- "$(dirname -- "$AUTH_FILE")" && pwd -P)/$(basename -- "$AUTH_FILE")"
  printf '%s\n' "$AUTH_FILE" > "$STATE/codex-auth-path"
  export SELFHOST_CODEX_AUTH_FILE="$AUTH_FILE"
  COMPOSE+=(--profile codex)
fi
printf 'Starting Social Monitor at http://localhost:%s …\n' "$PORT"
if [[ "$AI_ENABLED" != true ]]; then
  "${COMPOSE[@]}" --profile ai --profile codex stop intelligence agent-runtime
fi
"${COMPOSE[@]}" up -d --wait --wait-timeout 300
URL="http://localhost:$PORT"
printf 'Application ready: %s\n' "$URL"
if [[ "$AI_ENABLED" == true ]]; then
  "${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap
  URL="$URL/summaries"
  printf 'First summary ready. Open %s\n' "$URL"
else
  "${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap node dist/scripts/quickstart/bootstrap.js --collect-only
  URL="$URL/feed"
  printf 'RSS/HN collection ready. Open %s\nAI setup: docs/reference/self-hosting.md.\n' "$URL"
fi
if ((OPEN_BROWSER == 1)); then
  if command -v open >/dev/null; then open "$URL" || true
  elif command -v xdg-open >/dev/null; then xdg-open "$URL" >/dev/null 2>&1 || true; fi
fi
