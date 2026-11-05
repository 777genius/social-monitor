"""Linux-only lifetime bridge for the retained metric fixture, not a budget owner."""
import ctypes
import os
import signal
import subprocess
import sys


def parent_died(_signal, _frame):
    # The runner created this private session; fixture descendants inherit it.
    os.killpg(os.getpgrp(), signal.SIGKILL)


if sys.platform != "linux" or os.getpgrp() != os.getpid():
    sys.exit("Native metric startup guard requires a private Linux process group")

expected_parent = int(sys.argv[1])
signal.signal(signal.SIGTERM, parent_died)
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
    raise OSError(ctypes.get_errno(), "Cannot arm native metric parent-death guard")
# Parent may have died before prctl (including before Python initialized).
# No fixture exists yet. A death after this check is delivered by the kernel.
if os.getppid() != expected_parent:
    parent_died(None, None)

# Pass Node's IPC channel directly through; Python never consumes phase messages.
fixture = subprocess.Popen(sys.argv[2:], pass_fds=(3,))
os.close(3)
status = fixture.wait()
if status < 0:
    if -status not in (signal.SIGKILL, signal.SIGSTOP):
        signal.signal(-status, signal.SIG_DFL)
    os.kill(os.getpid(), -status)
sys.exit(status)
