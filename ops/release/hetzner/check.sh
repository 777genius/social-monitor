#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export PYTHONDONTWRITEBYTECODE=1
bash -n release-gate.sh check.sh
python3 -B -m unittest discover -v -p '*_test.py'
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck release-gate.sh check.sh
else
  printf '%s\n' 'BLOCKER: shellcheck is not installed; host must run the shellcheck gate.' >&2
  exit 2
fi
