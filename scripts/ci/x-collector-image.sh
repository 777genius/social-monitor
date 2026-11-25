#!/usr/bin/env bash
set -euo pipefail
: "${GITHUB_SHA:?}" "${GITHUB_RUN_ID:?}" "${GITHUB_RUN_ATTEMPT:?}" "${RUNNER_TEMP:?}"
[[ $GITHUB_SHA =~ ^[a-f0-9]{40}$ && $GITHUB_RUN_ID =~ ^[0-9]+$ && $GITHUB_RUN_ATTEMPT =~ ^[0-9]+$ ]] || exit 1
[[ $(git rev-parse HEAD) == "$GITHUB_SHA" ]] || exit 1
output="$RUNNER_TEMP/x-collector-candidate"
[[ ! -e $output ]] || exit 1
mkdir -m 700 "$output"
state=$(mktemp -d "$RUNNER_TEMP/x-collector-state.XXXXXXXX")
trap 'sudo rm -rf -- "$state"' EXIT
sudo chmod 755 "$state"
sudo chown root:root "$state"
printf 'version=social-monitor-x-launch-hold-v1\nphase=allowed\n' | sudo tee "$state/x-launch-state.v1" >/dev/null
sudo touch "$state/x-launch.lock"
sudo chown root:root "$state/x-launch-state.v1" "$state/x-launch.lock"
sudo chmod 644 "$state/x-launch-state.v1" "$state/x-launch.lock"
# Pin image-store semantics: this artifact must preserve the manifest digest on load.
server_version=$(docker version --format '{{.Server.Version}}')
[[ $server_version =~ ^29\. ]] || { echo 'Docker 29 required' >&2; exit 1; }
store=$(docker info --format '{{json .DriverStatus}}')
STORE="$store" python3 -c 'import json,os; assert ["driver-type", "io.containerd.snapshotter.v1"] in json.loads(os.environ["STORE"])'
ref="x-collector-ci:$GITHUB_SHA"
docker build --platform linux/amd64 --provenance=false -f ops/deploy/production-runtime/x-collector.Dockerfile --build-arg "SOCIAL_MONITOR_RELEASE_SHA=$GITHUB_SHA" -t "$ref" .
id=$(docker image inspect "$ref" --format '{{.Id}}')
[[ $id =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
revision=$(docker image inspect "$id" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
[[ $revision == "$GITHUB_SHA" ]] || exit 1
descriptor=$(docker image inspect "$id" --format '{{json .Descriptor}}')
platform=$(docker image inspect "$id" --format '{{.Os}}/{{.Architecture}}')
DESCRIPTOR="$descriptor" IMAGE_ID="$id" PLATFORM="$platform" python3 -c 'import json,os; d=json.loads(os.environ["DESCRIPTOR"]); assert os.environ["PLATFORM"] == "linux/amd64"; assert d["digest"] == os.environ["IMAGE_ID"]; assert d["mediaType"] in ("application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json")'
# Run the image's real guard entrypoint, offline, with only synthetic state.
docker run --rm --network none --read-only --mount "type=bind,src=$state,dst=/run/social-monitor-x-launch-state,readonly" "$id" python -c 'from x_collector import server, post_lookup; from x_collector.v1 import x_collector_pb2; assert "LookupPosts" in x_collector_pb2.DESCRIPTOR.services_by_name["XCollectorService"].methods_by_name'
printf 'version=social-monitor-x-launch-hold-v1\nphase=held\n' | sudo tee "$state/x-launch-state.v1" >/dev/null
held_error="$output/held-check.stderr"
held_status=0
docker run --rm --network none --read-only --mount "type=bind,src=$state,dst=/run/social-monitor-x-launch-state,readonly" "$id" python -c 'raise SystemExit(0)' >/dev/null 2>"$held_error" || held_status=$?
if [[ $held_status != 75 ]] || ! grep -Fxq 'x-launch-denied: X source launch is held' "$held_error"; then
  echo "held guard check failed (exit $held_status)" >&2
  exit 1
fi
rm -- "$held_error"
docker save -o "$output/image.tar" "$id"
IMAGE_ID="$id" OUTPUT="$output" python3 - <<'PY'
import hashlib, json, os
from pathlib import Path
p=Path(os.environ['OUTPUT'])
h=hashlib.sha256()
with (p/'image.tar').open('rb') as f:
    for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
manifest={'sha256':h.hexdigest(),'imageId':os.environ['IMAGE_ID'],
          'revision':os.environ['GITHUB_SHA'],'runId':os.environ['GITHUB_RUN_ID'],
          'runAttempt':os.environ['GITHUB_RUN_ATTEMPT']}
(p/'manifest.json').write_text(json.dumps(manifest,sort_keys=True)+'\n')
PY
