"""Private observer configuration and finite decoding; no candidate configuration."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import time
from itertools import islice
from contract import DIGEST, SHA, RUN, Denied, atomic, canonical, private_file_digest, require, sync_dir, trusted

CONFIG = '/etc/social-monitor/release/operator.conf'
REVIEW = '/etc/social-monitor/release/compatibility-review.json'
SERVICE = '/etc/social-monitor/release/observer.pg_service.conf'
PASS = '/etc/social-monitor/release/observer.pgpass'
TOKEN = '/etc/social-monitor/release/github-readonly.token'  # Legacy, never read by this observer.
AUTH_ROOT = Path('/run/social-monitor-release-github')
AUTH_LIMIT = 8192  # Includes JSON escaping of a maximum-length printable token.
AUTH_TOKEN = r'[!-~]{20,2048}'
GH_DIR = '/etc/social-monitor/release/github-empty'
INCLUDE_DIR = '/etc/social-monitor/release/pgbackrest-empty'
SYSTEM_ID = '7688442011877063482'
EXECUTABLES = {'curl': '/usr/bin/curl', 'docker': '/usr/bin/docker',
               'psql': '/usr/lib/postgresql/18/bin/psql',
               'backup': '/usr/local/sbin/pgbackrest-with-cipher-pass'}
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/nonexistent', 'LC_ALL': 'C'}


def match(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value, flags=re.ASCII) is not None


def exact(value, keys):
    require(isinstance(value, dict) and set(value) == set(keys), 'operator-shape')


def sha_bytes(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def decode(data, limit=16 * 1024**2):
    require(type(data) is bytes and 0 < len(data) <= limit, 'operator-json-size')
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'operator-json-duplicate')
            result[key] = value
        return result
    try:
        value = json.loads(data, object_pairs_hook=pairs,
                           parse_constant=lambda _: require(False, 'operator-json-number'))
        def finite(item, depth=0):
            require(depth <= 32, 'operator-json-depth')
            if isinstance(item, dict):
                for key, child in item.items():
                    require(len(key) <= 4096, 'operator-json-key')
                    finite(child, depth + 1)
            elif isinstance(item, list):
                require(len(item) <= 100000, 'operator-json-count')
                for child in item:
                    finite(child, depth + 1)
            elif isinstance(item, str):
                require(len(item) <= 65536, 'operator-json-string')
            else:
                require(item is None or type(item) in (bool, int) or
                        type(item) is float and math.isfinite(item), 'operator-json-type')
        finite(value)
        return value
    except (ValueError, UnicodeError, RecursionError):
        raise Denied('operator-json') from None


def uint64(value):
    if type(value) is int:
        value = str(value)
    require(match(r'[1-9][0-9]{0,19}', value) and int(value) <= 2**64 - 1,
            'operator-system-id')
    return value


def private_bytes(path, limit=65536, secret=False):
    """Use core protection plus a no-follow read and before/after byte fingerprint."""
    before = private_file_digest(path)
    fd = os.open(trusted(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_size <= limit
                and (not secret or not info.st_mode & 0o077), 'operator-private-file')
        data = stream.read(limit + 1)
    require(0 < len(data) <= limit and sha_bytes(data) == before
            and private_file_digest(path) == before, 'operator-private-race')
    return data


def auth_path(sha, run):
    require(match(SHA, sha) and match(RUN, run), 'github-auth-binding')
    return AUTH_ROOT / (sha + '-' + run + '.json')


def auth_record(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= AUTH_LIMIT
            and not info.st_mode & 0o077, 'github-auth-file')
    raw = private_bytes(path, AUTH_LIMIT, secret=True)
    saved = decode(raw, AUTH_LIMIT)
    exact(saved, ('sha', 'ci_run_id', 'lease', 'token', 'expires_at'))
    require(auth_path(saved['sha'], saved['ci_run_id']) == path and
            type(saved['expires_at']) is int and saved['expires_at'] > 0 and
            match(r'[0-9a-f]{32}', saved['lease']) and
            match(AUTH_TOKEN, saved['token']), 'github-auth-invalid')
    return saved, raw


def prune_expired_auth():
    changed = False
    for path in list(islice(AUTH_ROOT.iterdir(), 33)):
        if not match(SHA + '-' + RUN + r'\.json', path.name):
            continue
        try:
            saved, _ = auth_record(path)
        except (Denied, OSError):
            continue  # Unknown, foreign, non-private or invalid state is never deleted.
        if saved['expires_at'] <= time.time():
            path.unlink(); changed = True
    if changed:
        sync_dir(AUTH_ROOT)


def github_auth_update(sha, run, raw, clear=False):
    """Root controller owns the machine fence and shared lock; no token in responses."""
    payload = decode(raw, AUTH_LIMIT)
    exact(payload, ('lease',) if clear else ('lease', 'token'))
    require(match(r'[0-9a-f]{32}', payload['lease']), 'github-auth-lease')
    path = auth_path(sha, run)
    response = {'sha': sha, 'ci_run_id': run}
    if clear:
        if not AUTH_ROOT.exists():
            require(not AUTH_ROOT.is_symlink(), 'github-auth-path')
            return {**response, 'cleared': True}
        trusted(AUTH_ROOT, directory=True)
        if not path.exists():
            require(not path.is_symlink(), 'github-auth-path')
            return {**response, 'cleared': True}
        saved, _ = auth_record(path)
        if saved.get('lease') != payload['lease']:
            return {**response, 'cleared': False}
        path.unlink(); sync_dir(AUTH_ROOT)
        return {**response, 'cleared': True}
    require(match(AUTH_TOKEN, payload['token']), 'github-auth-token')
    AUTH_ROOT.mkdir(mode=0o700, exist_ok=True)
    trusted(AUTH_ROOT, directory=True)
    require(not AUTH_ROOT.stat().st_mode & 0o077, 'github-auth-mode')
    prune_expired_auth()
    require(path.exists() or len(list(islice(AUTH_ROOT.iterdir(), 33))) < 32, 'github-auth-count')
    if path.exists():
        auth_record(path)
    atomic(path, {**response, **payload, 'expires_at': int(time.time()) + 3600})
    return {**response, 'configured': True}


def github_auth_header(config):
    """Only cohort GitHub observations opt in; legacy read-only preflight stays unchanged."""
    binding = getattr(config, 'github_binding', None)
    if binding is None:
        return None
    path = auth_path(binding['sha'], binding['ci_run_id'])
    saved, raw = auth_record(path)
    require(time.time() < saved['expires_at'] <= time.time() + 3600, 'github-auth-expired')
    config.pin(str(path), sha_bytes(raw))
    return ('Authorization: Bearer ' + saved['token'] + '\n').encode('ascii')


def empty_directory(path):
    require(not any(trusted(path, directory=True).iterdir()), 'operator-config-directory')


def ini(data):
    """Small strict configuration subset: no includes, interpolation or duplicates."""
    result, section = {}, None
    try:
        for line in data.decode('utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith(('#', ';')):
                continue
            if line.startswith('[') and line.endswith(']'):
                section = line[1:-1]
                require(match(r'[a-zA-Z0-9_.:-]{1,100}', section)
                        and section not in result, 'operator-ini-section')
                result[section] = {}
            else:
                require(section is not None and '=' in line, 'operator-ini')
                key, value = (part.strip() for part in line.split('=', 1))
                require(match(r'[a-zA-Z0-9_-]{1,100}', key) and key not in result[section]
                        and value and len(value) <= 4096 and '${' not in value
                        and 'include' not in key, 'operator-ini-option')
                result[section][key] = value
        return result
    except UnicodeError:
        raise Denied('operator-ini') from None


class Configuration:
    def __init__(self, core, data):
        exact(data, ('version', 'database', 'backup_config_sha256', 'wrapper_sha256'))
        require(type(data['version']) is int and data['version'] == 1, 'operator-version')
        require(core['project'] == 'platform-social-monitor'
                and core['project_directory'] in ('/srv/platform/projects/social-monitor',
                                                 '/srv/platform/projects/social-monitor/deploy/private-api'),
                'operator-project')
        identity = core['backup_identity']
        require(identity['wrapper'] == EXECUTABLES['backup']
                and identity['config_path'] == '/etc/pgbackrest/production-main.conf'
                and identity['stanza'] == 'production-main' and identity['repository'] == '1'
                and identity['system_identifier'] == SYSTEM_ID, 'operator-backup-config')
        require(all(match(DIGEST, data[key]) for key in ('backup_config_sha256', 'wrapper_sha256')),
                'operator-closure')
        db = data['database']
        exact(db, ('service', 'database', 'role', 'host', 'port'))
        require(match(r'[a-z][a-z0-9_]{0,62}', db['service'])
                and match(r'[a-z][a-z0-9_]{0,62}', db['database'])
                and match(r'[a-z][a-z0-9_]{0,62}', db['role'])
                and db['role'] not in ('postgres', 'social_monitor')
                and db['host'] == '/var/run/postgresql' and db['port'] == '5432', 'operator-db-config')
        self.core, self.data, self.db = core, data, db
        self.inputs, self.metadata = {}, {}

    def stamp(self, path):
        info = trusted(path).stat()
        return (info.st_dev, info.st_ino, info.st_size, info.st_uid, info.st_gid,
                info.st_mode, info.st_mtime_ns, info.st_ctime_ns)

    def pin(self, path, expected=None):
        before = self.stamp(path)
        value = private_file_digest(path)
        require(self.stamp(path) == before, 'operator-input-changed')
        require(expected is None or value == expected, 'operator-input-fingerprint')
        if path in self.inputs:
            require(value == self.inputs[path] and before == self.metadata[path], 'operator-input-changed')
        self.inputs[path], self.metadata[path] = value, before
        return value

    def validate(self):
        for path in EXECUTABLES.values():
            trusted(path)
            require(os.access(path, os.X_OK), 'operator-executable')
        self.pin(EXECUTABLES['backup'], self.data['wrapper_sha256'])
        self.pin(self.core['backup_identity']['config_path'], self.data['backup_config_sha256'])
        service = ini(private_bytes(SERVICE, secret=True))
        exact(service, (self.db['service'],))
        expected = {'host': self.db['host'], 'port': self.db['port'],
                    'dbname': self.db['database'], 'user': self.db['role'],
                    'connect_timeout': '5'}
        require(service[self.db['service']] == expected, 'operator-service-binding')
        private_bytes(PASS, secret=True)  # libpq alone interprets the separately provisioned password.
        for path in (SERVICE, PASS):
            self.pin(path)
        self.recheck()

    def recheck_inputs(self):
        for path, fingerprint in self.inputs.items():
            require(self.stamp(path) == self.metadata[path]
                    and private_file_digest(path) == fingerprint
                    and self.stamp(path) == self.metadata[path], 'operator-input-changed')

    def recheck(self):
        self.recheck_inputs()
        empty_directory(GH_DIR)
        empty_directory(INCLUDE_DIR)


def load():
    from contract import CONFIG as CORE_CONFIG, load_config
    core_before = private_file_digest(CORE_CONFIG)
    core = load_config()
    data = private_bytes(CONFIG)
    config = Configuration(core, decode(data, 65536))
    config.pin(CORE_CONFIG, core_before)
    config.pin(CONFIG, sha_bytes(data))
    # Pin the same fixed startup supply as the executable entrypoint; recheck
    # around every observation, without any request-controlled code paths.
    from operator_adapter import INSTALL, MODULES
    for path in ('/etc/social-monitor/release/operator-adapter',
                 '/opt/social-monitor-release-python/bin/python3',
                 '/opt/social-monitor-release-python/pyvenv.cfg',
                 *(str(INSTALL / (name + '.py')) for name in MODULES)):
        config.pin(path)
    config.validate()
    return config
