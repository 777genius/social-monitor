# shellcheck shell=bash
# shellcheck disable=SC2034 # TEST_PHASE is consumed by the sourcing parent's ERR trap.
# Sourced by the focused parent contract test; keep scenario state in one shell.
TEST_PHASE=workflow-contract
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
python3 - "$WORKFLOW" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1])
lines = workflow.read_text(encoding="utf-8").splitlines()
step_header = "      - name: Deploy changed components"
step_indexes = [index for index, line in enumerate(lines) if line == step_header]
if len(step_indexes) != 1:
    raise SystemExit("workflow must contain exactly one deploy-components step")

step_start = step_indexes[0]
step_end = next(
    (
        index
        for index in range(step_start + 1, len(lines))
        if lines[index].startswith("      - name: ")
    ),
    len(lines),
)
step = lines[step_start:step_end]
expected = (
    '        run: bash ops/deploy/github-production-deploy-client.sh '
    'deploy "$GITHUB_SHA"'
)
if step.count(expected) != 1:
    raise SystemExit("deploy-components step must contain one exact ordinary deploy")
if any("CONTROL_CHANGED" in line or "POSTGRES_POOL_BOOTSTRAP" in line for line in step):
    raise SystemExit("ordinary deploy must not receive stale bootstrap arguments")
PY
