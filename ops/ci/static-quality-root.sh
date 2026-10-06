#!/usr/bin/env bash
set -euo pipefail
# The fixed root-owned helper owns cancellation of its privileged process group.
# FD 3 is observation only: EOF (or any input) means cancel, never a command.
exec /root/social-monitor-release-contract-tests/python/bin/python3 -I -B - 3<&0 <<'PY'
import os
import select
import signal
import subprocess
import sys
import time

cancelled = False


def cancel(_signum, _frame):
    global cancelled
    cancelled = True


for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(signum, cancel)

checks = """
set -euo pipefail
/usr/bin/bash --noprofile --norc /root/social-monitor-release-contract-tests/ops/release/hetzner/check.sh
/root/social-monitor-release-contract-tests/python/bin/python3 -I -B /root/social-monitor-release-contract-tests/ops/ci/release-e2e-driver_test.py
/root/social-monitor-release-contract-tests/python/bin/python3 -I -B /root/social-monitor-release-contract-tests/ops/ci/release-e2e-fixture/operator_test.py
/root/social-monitor-release-contract-tests/python/bin/python3 -I -B /root/social-monitor-release-contract-tests/ops/ci/release-database-plan_test.py
"""
child = subprocess.Popen(
    ["/usr/bin/bash", "--noprofile", "--norc", "-c", checks],
    stdin=subprocess.DEVNULL, start_new_session=True,
)
try:
    while not cancelled:
        status = child.poll()
        if status is not None:
            sys.exit(status if status >= 0 else 1)
        readable, _, _ = select.select([3], [], [], 0.1)
        if readable:
            os.read(3, 1)
            cancelled = True
finally:
    if child.returncode is None:
        # Keep the leader unreaped until escalation, so its group ID cannot be reused.
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        time.sleep(5)
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait(timeout=5)
sys.exit(143)
PY
