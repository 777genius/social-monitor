"""Read the fixed admin release marker inside one exact frontend container."""
import re
from contract import require
from operator_config import EXECUTABLES

PATH = '/usr/share/nginx/admin/release-sha.txt'


def read_admin_marker(container_id, *, path, max_bytes, timeout_seconds, runner=None):
    require(isinstance(container_id, str) and re.fullmatch(r'[0-9a-f]{64}', container_id) and
            path == PATH and type(max_bytes) is int and max_bytes == 41 and timeout_seconds == 5,
            'frontend-marker-request')
    if runner is None:
        # The external process is supervised across startup, execution and output.
        from operator_adapter import Runner
        runner = Runner(seconds=7, command_seconds=6)
    raw = runner.run([EXECUTABLES['docker'], 'exec', container_id, '/bin/cat', PATH], limit=41)
    require(isinstance(raw, bytes) and re.fullmatch(rb'[0-9a-f]{40}\n', raw), 'frontend-marker-response')
    return raw
