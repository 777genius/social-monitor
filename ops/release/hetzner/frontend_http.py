"""Bounded direct HTTPS reads for fixed public/admin frontend readiness URLs."""
import re
from contract import require
from operator_config import EXECUTABLES


def http_get(url, *, timeout_seconds, max_bytes, follow_redirects=False, use_proxy=False, runner=None):
    require(isinstance(url, str) and len(url) <= 256 and timeout_seconds == 5 and
            type(max_bytes) is int and 0 < max_bytes <= 262144 and
            follow_redirects is False and use_proxy is False, 'frontend-http-options')
    require(re.fullmatch(r'https://(?:social-monitor\.app/(?:favicon\.svg|release-sha\.txt\?release=[0-9a-f]{40})?'
                         r'|admin\.social-monitor\.app/)', url) is not None, 'frontend-http-url')
    if runner is None:
        # Runner supervises the entire process, including DNS, with a hard deadline and output cap.
        from operator_adapter import Runner
        runner = Runner(seconds=7, command_seconds=6)
    raw = runner.run([EXECUTABLES['curl'], '-q', '--silent', '--show-error', '--noproxy', '*',
                      '--proto', '=https', '--max-redirs', '0', '--connect-timeout', '5', '--max-time', '5',
                      '--header', 'Accept-Encoding: identity', '--write-out', '\n%{http_code}', '--', url],
                     limit=max_bytes + 4)
    require(isinstance(raw, bytes) and 4 <= len(raw) <= max_bytes + 4 and
            raw[-4:-3] == b'\n' and re.fullmatch(rb'[1-5][0-9]{2}', raw[-3:]), 'frontend-http-response')
    return {'status': int(raw[-3:]), 'body': raw[:-4]}
