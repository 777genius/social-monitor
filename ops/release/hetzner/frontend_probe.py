"""Read-only frontend readiness policy with injected, bounded transport seams."""
import re

from contract import DIGEST, SHA, Denied, require

PUBLIC = 'https://social-monitor.app'
ADMIN = 'https://admin.social-monitor.app'
ADMIN_MARKER = '/usr/share/nginx/admin/release-sha.txt'
SECONDS = 5
BINDING = {'container_id', 'image_id', 'project', 'public_sha', 'admin_sha', 'verifier_sha256'}


def _binding(value):
    require(isinstance(value, dict) and set(value) == BINDING, 'frontend-probe-binding')
    for key, pattern in [('container_id', r'[0-9a-f]{64}'), ('image_id', DIGEST),
                         ('project', r'[a-z0-9][a-z0-9_-]{0,127}'),
                         ('public_sha', SHA), ('admin_sha', SHA), ('verifier_sha256', DIGEST)]:
        require(isinstance(value[key], str) and re.fullmatch(pattern, value[key]), 'frontend-probe-binding')
    return dict(value)


def _identity(inspect, binding):
    try:
        value = inspect(binding['container_id'])
    except Exception:
        raise Denied('frontend-probe-inspect-unavailable') from None
    require(isinstance(value, dict), 'frontend-probe-container')
    config, state = value.get('Config'), value.get('State')
    require(isinstance(config, dict) and isinstance(state, dict), 'frontend-probe-container')
    labels = config.get('Labels')
    require(isinstance(labels, dict) and value.get('Id') == binding['container_id']
            and value.get('Image') == binding['image_id']
            and labels.get('com.docker.compose.project') == binding['project']
            and labels.get('com.docker.compose.service') == 'frontend'
            and state.get('Running') is True and state.get('Restarting') is False
            and state.get('OOMKilled', False) is False and state.get('Dead', False) is False
            and type(state.get('Pid')) is int and state['Pid'] > 0
            and isinstance(state.get('StartedAt'), str) and 0 < len(state['StartedAt']) <= 64
            and not state['StartedAt'].startswith('0001-01-01')
            and type(value.get('RestartCount')) is int and value['RestartCount'] >= 0,
            'frontend-probe-container')
    return (value['Id'], value['Image'], binding['project'], 'frontend',
            state['Pid'], state['StartedAt'], value['RestartCount'])


def _http(http_get, url, limit, expected):
    try:
        response = http_get(url, timeout_seconds=SECONDS, max_bytes=limit,
                            follow_redirects=False, use_proxy=False)
    except Exception:
        raise Denied('frontend-probe-http-unavailable') from None
    require(isinstance(response, dict) and set(response) == {'status', 'body'}
            and type(response['status']) is int and type(response['body']) is bytes
            and len(response['body']) <= limit, 'frontend-probe-http-response')
    require(response['status'] == expected, 'frontend-probe-http-status')
    return response['body']


def make_frontend_probe(inspect, http_get, read_admin_marker):
    """Return engine callback probe(binding), without creating a network client.

    inspect(id) returns a full Docker inspect dictionary under the caller's execution
    deadline. http_get(url, *, timeout_seconds, max_bytes, follow_redirects, use_proxy)
    returns exactly {status: int, body: bytes}; its adapter must enforce the supplied
    total deadline, byte cap and disabled redirects/proxies during I/O.
    read_admin_marker(id, *, path, max_bytes, timeout_seconds) returns bounded bytes
    from the fixed mounted file. No shell, credential or URL comes from the binding.
    The engine independently proves source inodes and verifier_sha256 before/after;
    this callback only echoes that digest, and never executes the verifier.
    """
    require(all(callable(callback) for callback in (inspect, http_get, read_admin_marker)),
            'frontend-probe-callback')

    def probe(binding):
        binding = _binding(binding)
        before = _identity(inspect, binding)
        _http(http_get, PUBLIC + '/', 262144, 200)
        _http(http_get, PUBLIC + '/favicon.svg', 65536, 200)
        public = _http(http_get, PUBLIC + '/release-sha.txt?release=' + binding['public_sha'], 41, 200)
        require(public == (binding['public_sha'] + '\n').encode(), 'frontend-probe-public-marker')
        _http(http_get, ADMIN + '/', 65536, 401)
        try:
            admin = read_admin_marker(binding['container_id'], path=ADMIN_MARKER,
                                      max_bytes=41, timeout_seconds=SECONDS)
        except Exception:
            raise Denied('frontend-probe-admin-unavailable') from None
        require(type(admin) is bytes and len(admin) <= 41
                and admin == (binding['admin_sha'] + '\n').encode(), 'frontend-probe-admin-marker')
        require(_identity(inspect, binding) == before, 'frontend-probe-process-changed')
        return {'ready': True, 'service': 'frontend', **binding, 'public_root_status': 200,
            'public_favicon_status': 200, 'public_release_sha': binding['public_sha'],
            'admin_root_status': 401, 'mounted_admin_sha': binding['admin_sha']}

    return probe
