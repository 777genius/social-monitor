#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
SOURCE_BASE=683c6ff94e964a2f268041fda462a2aa1c9eb2e2
TARGET=${GITHUB_SHA:-HEAD}
SHA=1234567890abcdef1234567890abcdef12345678
TEMP_ROOT=${TMPDIR:-/tmp}
[[ -d $TEMP_ROOT && -w $TEMP_ROOT ]] || TEMP_ROOT=/tmp
FIXTURE=$(mktemp -d "$TEMP_ROOT/forced-wrapper-cross-version.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

git -C "$PROJECT_ROOT" cat-file -e "$SOURCE_BASE^{commit}"
git -C "$PROJECT_ROOT" cat-file -e "$TARGET^{commit}"
git -C "$PROJECT_ROOT" show \
  "$SOURCE_BASE:ops/deploy/social-monitor-production-ssh-wrapper.sh" > "$FIXTURE/n-1.sh"
git -C "$PROJECT_ROOT" show \
  "$TARGET:ops/deploy/social-monitor-production-ssh-wrapper.sh" > "$FIXTURE/target.sh"

mkdir "$FIXTURE/bin"
cat > "$FIXTURE/bin/sudo" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ $1 == -n ]]
shift
[[ ${1:-} != -- ]] || shift
exec "$@"
SH
cat > "$FIXTURE/entrypoint" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" > "$ACTION_PATH"
cat > "$STDIN_PATH"
SH
chmod 0755 "$FIXTURE/bin/sudo" "$FIXTURE/entrypoint"

for version in n-1 target; do
  python3 - "$FIXTURE/$version.sh" "$FIXTURE/bin" "$FIXTURE/entrypoint" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
source = source.replace("PATH=/usr/bin:/bin:/usr/sbin:/sbin", f"PATH={sys.argv[2]}:/usr/bin:/bin", 1)
source = source.replace("ENTRYPOINT=/var/data/social-monitor/control/github-production-deploy.sh", f"ENTRYPOINT={sys.argv[3]}", 1)
path.write_text(source, encoding="utf-8")
path.chmod(0o755)
PY
  printf 'nul\0line-one\nline-two-without-final-newline' > "$FIXTURE/payload"
  ACTION_PATH=$FIXTURE/action STDIN_PATH=$FIXTURE/stdin \
    SSH_ORIGINAL_COMMAND="upload $SHA" bash "$FIXTURE/$version.sh" < "$FIXTURE/payload"
  cmp "$FIXTURE/payload" "$FIXTURE/stdin"
  grep -Fx upload "$FIXTURE/action" >/dev/null

  for action in plan deploy disk-report; do
    ACTION_PATH=$FIXTURE/action STDIN_PATH=$FIXTURE/stdin \
      SSH_ORIGINAL_COMMAND="$action $SHA" bash "$FIXTURE/$version.sh" < "$FIXTURE/payload"
    [[ ! -s $FIXTURE/stdin ]]
    grep -Fx "$action" "$FIXTURE/action" >/dev/null
  done
done

# shellcheck disable=SC2016 # Literal GitHub expression is asserted in workflow text.
upload_line=$(grep -nF 'bash ops/deploy/github-production-deploy-client.sh upload "$GITHUB_SHA"' "$WORKFLOW" | cut -d: -f1)
# shellcheck disable=SC2016 # Literal GitHub expression is asserted in workflow text.
deploy_line=$(grep -nF 'run: bash ops/deploy/github-production-deploy-client.sh deploy "$GITHUB_SHA"' "$WORKFLOW" | cut -d: -f1)
[[ -n $upload_line && -n $deploy_line && $upload_line -lt $deploy_line ]]
sed -n "$((upload_line - 8)),${upload_line}p" "$WORKFLOW" | \
  grep -F "needs.plan.outputs.frontend == 'true'" >/dev/null
