"""Fixed TEST composition of unchanged native SQL/backup/readiness observers.

Production Configuration remains unchanged. Only an independently validated
random TEST project label is translated for the literal production probe check.
No response body, image identity, SQL result or backup proof is manufactured.
"""
import hashlib
import os
from pathlib import Path
import stat
import sys

CORE = Path('/opt/social-monitor-release')
sys.path.insert(0, str(CORE))
from contract import canonical, load_config, private_file_digest, require, trusted
from operator_config import (Configuration, CONFIG, SERVICE, PASS, INCLUDE_DIR,
                             GH_DIR, EXECUTABLES, SYSTEM_ID, decode, exact, ini, match,
                             private_bytes, uint64)
from operator_adapter import Runner as NativeRunner
import operator_database
import operator_backup
import operator_probe


NATIVE_FILE_LIMIT = 64 * 1024**2


def native_file_chunks(path, maximum=NATIVE_FILE_LIMIT):
    """Bound trusted native reads independently of the unchanged private-file cap."""
    require(type(maximum) is int and 0 < maximum <= NATIVE_FILE_LIMIT,
            'test-native-size')
    require(isinstance(path, (str, Path)) and str(Path(path)) == str(path),
            'test-native-path')
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts and path == path.resolve(),
            'test-native-path')

    def identity(info):
        return (info.st_dev, info.st_ino, info.st_size, info.st_uid, info.st_gid,
                info.st_mode, info.st_mtime_ns, info.st_ctime_ns)

    def installation():
        result = []
        for item in (path, *path.parents):
            info = item.lstat()
            require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                    'test-native-installation')
            require(stat.S_ISREG(info.st_mode) if item == path else stat.S_ISDIR(info.st_mode), 'test-native-type')
            result.append(identity(info))
        return tuple(result)

    installed = installation()
    require(installed[0][2] <= maximum, 'test-native-size')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0
                and not before.st_mode & 0o022 and before.st_size <= maximum,
                'test-native-size')
        require(identity(before) == installed[0], 'test-native-changed')
        total = 0
        while chunk := stream.read(65536):
            total += len(chunk)
            require(total <= maximum and total <= before.st_size, 'test-native-size')
            yield chunk
        after = os.fstat(stream.fileno())
        require(identity(before) == identity(after) and total == before.st_size
                and path == path.resolve() and installation() == installed,
                'test-native-changed')


def native_file_digest(path, maximum=NATIVE_FILE_LIMIT):
    checksum = hashlib.sha256()
    for chunk in native_file_chunks(path, maximum):
        checksum.update(chunk)
    return 'sha256:' + checksum.hexdigest()


def test_shape(core, data):
    require(match(r'sm-rc-e2e-[0-9a-f]{16}', core.get('project'))
            and core.get('project_directory') == '/srv/fixture'
            and core.get('state') == '/var/lib/social-monitor-release'
            and core.get('inbox') == '/var/lib/social-monitor-release/inbox'
            and core.get('adapter') == '/etc/social-monitor/release/operator-adapter'
            and core.get('compose_files') == ['/srv/fixture/compose.json']
            and core.get('env_files') == ['/srv/fixture/metadata.env']
            and core.get('fenced_units') == ['e2e-writer.timer', 'e2e-writer.service'],
            'test-composition-scope')
    exact(data, ('version', 'database', 'backup_config_sha256', 'wrapper_sha256'))
    require(type(data['version']) is int and data['version'] == 1, 'test-config-version')
    db = {'service': 'e2e_observer', 'database': 'e2e', 'role': 'e2e_observer',
          'host': '/var/run/postgresql', 'port': '5432'}
    require(data['database'] == db, 'test-observer-fixed')
    identity = core['backup_identity']
    exact(identity, ('wrapper', 'config_path', 'stanza', 'repository',
                     'repository_id', 'system_identifier'))
    require(identity['wrapper'] == EXECUTABLES['backup']
            and identity['config_path'] == '/etc/pgbackrest/e2e.conf'
            and identity['stanza'] == 'production-main' and identity['repository'] == '1'
            and uint64(identity['system_identifier']) != SYSTEM_ID
            and identity['repository_id'] == 'repo-sha256-' + hashlib.sha256(
                canonical({'type': 'posix', 'path': '/var/lib/pgbackrest'})).hexdigest(),
            'test-backup-fixed-live-identity')
    require(all(match(r'sha256:[0-9a-f]{64}', data[k]) for k in
                ('backup_config_sha256', 'wrapper_sha256')), 'test-closure-hashes')
    return db


class TestConfiguration(Configuration):
    """Reuse native pin/recheck; no production-ID or GitHub credential spoof."""
    def __init__(self):
        core = load_config()
        data = decode(private_bytes(CONFIG), 65536)
        self.db = test_shape(core, data)
        self.core, self.data = core, data
        self.inputs, self.metadata, self.native_inputs = {}, {}, {}
        for path in ('/etc/social-monitor/release/components.conf', CONFIG, SERVICE, PASS,
                     '/etc/social-monitor/release/operator-adapter',
                     '/opt/social-monitor-release-python/bin/python3',
                     '/opt/social-monitor-release-python/pyvenv.cfg',
                     '/opt/social-monitor-release-e2e/operator.py',
                     '/opt/social-monitor-release-e2e/release-e2e-native.py',
                     *(str(CORE / (name + '.py')) for name in
                       ('controller', 'contract', 'host', 'compose_contract', 'evidence', 'archive',
                        'bounds', 'prisma_history', 'operator_adapter', 'operator_config', 'operator_database',
                        'operator_backup', 'operator_probe', 'operator_github'))):
            self.pin(path)
        self.pin(EXECUTABLES['backup'], data['wrapper_sha256'])
        self.pin(core['backup_identity']['config_path'], data['backup_config_sha256'])
        for name in ('docker', 'psql', 'backup'):
            path = trusted(EXECUTABLES[name])
            require(os.access(path, os.X_OK), 'test-executable')
            self.pin_native(str(path), NATIVE_FILE_LIMIT if name == 'docker' else 16 * 1024**2)
        expected = {'host': self.db['host'], 'port': self.db['port'], 'dbname': self.db['database'],
                    'user': self.db['role'], 'connect_timeout': '5'}
        require(ini(private_bytes(SERVICE, secret=True)) == {self.db['service']: expected},
                'test-service-binding')
        require(private_bytes(PASS, secret=True) == b'*:*:e2e:e2e_observer:synthetic-e2e-only\n',
                'test-password-file')
        self.recheck()

    def pin_native(self, path, maximum=16 * 1024**2):
        before = self.stamp(path)
        value = native_file_digest(path, maximum)
        require(self.stamp(path) == before, 'operator-input-changed')
        entry = (value, before, maximum)
        require(path not in self.native_inputs or self.native_inputs[path] == entry,
                'operator-input-changed')
        self.native_inputs[path] = entry
        return value

    def recheck_inputs(self):
        super().recheck_inputs()
        for path, (fingerprint, metadata, maximum) in self.native_inputs.items():
            require(self.stamp(path) == metadata
                    and native_file_digest(path, maximum) == fingerprint
                    and self.stamp(path) == metadata, 'operator-input-changed')


class Runner(NativeRunner):
    def __init__(self):
        super().__init__()
        self.test_config = TestConfiguration()

    def run(self, argv, data=None, env=None, limit=2 * 1024**2):
        self.test_config.recheck()
        raw = super().run(argv, data=data, env=env, limit=limit)
        if argv[:4] == [EXECUTABLES['docker'], 'inspect', '--format', operator_probe.INSPECT]:
            require(len(argv) == 5, 'test-inspect-grammar')
            observed = decode(raw, 4096)
            exact(observed, ('id', 'image', 'started', 'running', 'project', 'service'))
            require(observed['project'] == self.test_config.core['project'], 'test-inspect-project')
            raw = canonical({**observed, 'project': 'platform-social-monitor'})
        self.test_config.recheck()
        return raw


def probe(config, runner, binding):
    from contract import Denied
    try:
        return operator_probe.probe(config, runner, binding)
    except Denied:
        return {'ready': False, 'postgres_pool_ok': False}


def write_private(path, data):
    path = Path(path)
    require(not path.exists() and not path.is_symlink(), 'test-config-already-installed')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def initialize(core):
    require(os.getuid() == 0 and os.geteuid() == 0, 'test-root-required')
    data = {'version': 1, 'database': {'service': 'e2e_observer', 'database': 'e2e',
            'role': 'e2e_observer', 'host': '/var/run/postgresql', 'port': '5432'},
            'backup_config_sha256': private_file_digest(core['backup_identity']['config_path']),
            'wrapper_sha256': private_file_digest(EXECUTABLES['backup'])}
    test_shape(core, data)
    for path, mode in ((INCLUDE_DIR, 0o755), (GH_DIR, 0o700)):
        directory = Path(path)
        directory.mkdir(mode=mode)
        directory.chmod(mode)
    write_private(SERVICE, b'[e2e_observer]\nhost=/var/run/postgresql\nport=5432\n'
                  b'dbname=e2e\nuser=e2e_observer\nconnect_timeout=5\n')
    write_private(PASS, b'*:*:e2e:e2e_observer:synthetic-e2e-only\n')
    write_private(CONFIG, canonical(data) + b'\n')
    config = TestConfiguration()
    observed = operator_database.identity(config, Runner())
    require(observed['system_identifier'] != SYSTEM_ID, 'test-production-system-id-forbidden')
    operator_backup.repository_identity(config)
    return observed
