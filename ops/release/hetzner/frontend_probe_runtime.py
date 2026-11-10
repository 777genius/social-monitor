"""Compose the fixed frontend readiness policy with bounded host transports."""
import re
from contract import require
from frontend_http import http_get
from frontend_marker import read_admin_marker
from frontend_probe import make_frontend_probe
from operator_config import EXECUTABLES, decode


def make_runtime_frontend_probe(runner_factory=None, http=http_get, marker=read_admin_marker):
    if runner_factory is None:
        from operator_adapter import Runner
        runner_factory = lambda: Runner(seconds=7, command_seconds=6)

    def inspect(ident):
        require(isinstance(ident, str) and re.fullmatch(r'[0-9a-f]{64}', ident), 'frontend-inspect-id')
        raw = runner_factory().run([EXECUTABLES['docker'], 'inspect', ident], limit=2 * 1024**2)
        values = decode(raw, 2 * 1024**2)
        require(isinstance(values, list) and len(values) == 1 and isinstance(values[0], dict),
                'frontend-inspect-result')
        return values[0]

    return make_frontend_probe(inspect, http, marker)
