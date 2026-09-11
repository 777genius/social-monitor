#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PREFLIGHT=$SCRIPT_DIR/preflight.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-nomad-preflight.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

VALID_SHA=$(printf 'a%.0s' $(seq 1 40))

fail() {
  printf 'preflight-test-error: %s\n' "$1" >&2
  exit 1
}

json_field() {
  # json_field <json> <dotted.path>
  node -e '
    const data = JSON.parse(process.argv[1]);
    const path = process.argv[2].split(".");
    let value = data;
    for (const key of path) {
      value = value === null || value === undefined ? undefined : value[key];
    }
    process.stdout.write(JSON.stringify(value ?? null));
  ' "$1" "$2"
}

assert_key_shape() {
  local json=$1
  node -e '
    const data = JSON.parse(process.argv[1]);
    const expected = ["collectedAt", "sourceSha", "host", "docker", "resources"].sort();
    const actual = Object.keys(data).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      console.error("top-level keys mismatch", actual);
      process.exit(1);
    }
    const expectedHost = ["hostname", "kernel", "architecture"].sort();
    if (JSON.stringify(Object.keys(data.host).sort()) !== JSON.stringify(expectedHost)) {
      console.error("host keys mismatch", data.host);
      process.exit(1);
    }
    const expectedDocker = ["serverVersion", "composeVersion"].sort();
    if (JSON.stringify(Object.keys(data.docker).sort()) !== JSON.stringify(expectedDocker)) {
      console.error("docker keys mismatch", data.docker);
      process.exit(1);
    }
    const expectedResources = ["memTotalKb", "diskFreeKb"].sort();
    if (JSON.stringify(Object.keys(data.resources).sort()) !== JSON.stringify(expectedResources)) {
      console.error("resources keys mismatch", data.resources);
      process.exit(1);
    }
  ' "$json" || fail "unexpected JSON shape: $json"
}

# --- a valid source SHA is echoed back verbatim, output is one JSON line ---
output=$("$PREFLIGHT" "$VALID_SHA")
[[ $output != *$'\n'* ]] || fail "expected a single JSON line with no embedded newlines"
assert_key_shape "$output"
[[ $(json_field "$output" sourceSha) == "\"$VALID_SHA\"" ]] || fail "sourceSha was not echoed back: $output"
[[ $(json_field "$output" collectedAt) =~ ^\"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\"$ ]] \
  || fail "collectedAt is not a UTC timestamp: $output"

# --- a malformed source SHA degrades to null and warns on stderr, not stdout ---
stdout_file=$FIXTURE/stdout
stderr_file=$FIXTURE/stderr
"$PREFLIGHT" "not-a-real-sha" >"$stdout_file" 2>"$stderr_file"
assert_key_shape "$(cat "$stdout_file")"
[[ $(json_field "$(cat "$stdout_file")" sourceSha) == "null" ]] || fail "malformed sourceSha should degrade to null"
grep -q 'malformed source SHA' "$stderr_file" || fail "expected a stderr warning for a malformed source SHA"

# --- missing optional tooling (docker, uname, hostname) degrades fields to
# null instead of failing the whole collection ---
minimal_bin=$FIXTURE/minimal-bin
mkdir -p "$minimal_bin"
for tool in date awk df head; do
  tool_path=$(command -v "$tool") || fail "test setup needs $tool on PATH"
  ln -s "$tool_path" "$minimal_bin/$tool"
done
bash_bin=$(command -v bash) || fail "test setup needs bash on PATH"
degraded_output=$(env -i PATH="$minimal_bin" "$bash_bin" "$PREFLIGHT" "$VALID_SHA")
assert_key_shape "$degraded_output"
[[ $(json_field "$degraded_output" host.hostname) == "null" ]] || fail "hostname should be null without the hostname tool"
[[ $(json_field "$degraded_output" host.kernel) == "null" ]] || fail "kernel should be null without uname"
[[ $(json_field "$degraded_output" docker.serverVersion) == "null" ]] || fail "docker.serverVersion should be null without docker"
[[ $(json_field "$degraded_output" sourceSha) == "\"$VALID_SHA\"" ]] || fail "a valid sourceSha must survive tool degradation"

# --- output never contains secret-shaped content ---
printf '%s' "$output" | grep -qiE 'password|secret|token|private[_-]?key' \
  && fail "preflight output must never contain credential-shaped text" || true

printf 'nomad preflight tests passed\n'
