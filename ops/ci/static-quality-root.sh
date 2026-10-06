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
# A fixed trusted keeper holds the group after bash exits. Only its private pipe
# reports status; neither stdin nor descendant output can supply root commands.
keeper = """
import os, signal, subprocess, sys
for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(signum, lambda _signum, _frame: None)
child = subprocess.Popen(
    ["/usr/bin/bash", "--noprofile", "--norc", "-c", sys.argv[2]],
    stdin=subprocess.DEVNULL,
)
status = child.wait()
os.write(int(sys.argv[1]), str(status if status >= 0 else 1).encode() + b'\\n')
os.close(int(sys.argv[1]))
while True:
    signal.pause()
"""
status_read, status_write = os.pipe()
child = subprocess.Popen(
    [sys.executable, "-I", "-B", "-c", keeper, str(status_write), checks],
    stdin=subprocess.DEVNULL, start_new_session=True, pass_fds=(status_write,),
)
os.close(status_write)
status = 1
report = b""
try:
    while not cancelled:
        readable, _, _ = select.select([3, status_read], [], [], 0.1)
        if 3 in readable:
            os.read(3, 1)
            cancelled = True
        elif status_read in readable:
            part = os.read(status_read, 64)
            report += part
            if b"\n" in report:
                status = int(report)
                break
            if not part:
                break
finally:
    # Never poll/reap the keeper before escalation. Even an unexpectedly dead
    # keeper pins its PID until wait(), so no reused/foreign group is signalled.
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
    os.close(status_read)
sys.exit(143 if cancelled else status)
PY
