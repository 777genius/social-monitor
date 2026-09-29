#!/usr/bin/env bash
set -euo pipefail

# Requires a locally preloaded postgres:18 image and an installed project node_modules.
# The test talks only to the container's loopback-published synthetic database.
case "${DOCKER_HOST:-unix:///var/run/docker.sock}" in
  unix://*) ;;
  *) echo "Refusing a nonlocal Docker daemon" >&2; exit 2 ;;
esac
daemon_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null)"
case "$daemon_endpoint" in
  unix://*) ;;
  *) echo "Refusing a nonlocal Docker context" >&2; exit 2 ;;
esac
if [[ ! -f node_modules/jest/bin/jest.js ]]; then
  echo "Install the repository's locked dependencies before running this proof" >&2
  exit 2
fi
docker image inspect postgres:18 >/dev/null
container="rss-sep24-proof-${UID}-${BASHPID}"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --pull never --rm -d --name "$container" \
  -e POSTGRES_PASSWORD=synthetic-rss-only -e POSTGRES_DB=rssproof \
  -p 127.0.0.1::5432 postgres:18 >/dev/null
port_binding="$(docker port "$container" 5432/tcp)"
port="${port_binding##*:}"
if [[ ! "$port" =~ ^[0-9]+$ ]]; then
  echo "PostgreSQL did not receive a loopback port" >&2
  exit 2
fi
ready=0
for _ in {1..80}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -p 5432 -U postgres -d rssproof >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
if (( ready == 0 )); then
  echo "Disposable PostgreSQL 18 did not become ready" >&2
  exit 2
fi
RSS_SEP24_PG18_URL="postgresql://postgres:synthetic-rss-only@127.0.0.1:${port}/rssproof" \
  node node_modules/jest/bin/jest.js --config jest.config.ts --runInBand \
  --runTestsByPath scripts/import-rss-sep24-verified.postgres.spec.ts
