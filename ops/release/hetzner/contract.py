"""Host-owned wire grammar, durable files and independently trusted configuration."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time

MACHINE = 'b28fc7b17042414386eb9b114046e50c'
CONFIG = '/etc/social-monitor/release/components.conf'
SHA = r'[0-9a-f]{40}'
DIGEST = r'sha256:[0-9a-f]{64}'
RUN = r'[1-9][0-9]{0,14}'
KEY = rf'{SHA}-[1-9][0-9]{{0,14}}'
GRAMMAR = {
    'status': [], 'preflight': [],
    'receive': [SHA, RUN, DIGEST, DIGEST, r'[1-9][0-9]{0,11}'],
    'admit': [SHA, RUN], 'activate': [SHA, RUN], 'verify': [SHA, RUN],
    'rollback': [SHA, RUN], 'receipt': [KEY + r'(?:-rollback)?'],
}


class Denied(Exception):
    pass


def require(ok, reason):
    if not ok:
        raise Denied(reason)


def parse(command):
    require(isinstance(command, str) and len(command) <= 512, 'grammar')
    # No shell tokenization, quotes, tabs, newline, options or path supplied by SSH.
    words = command.split(' ')
    require(words[0] in GRAMMAR, 'grammar')
    patterns = GRAMMAR[words[0]]
    require(len(words) == len(patterns) + 1, 'grammar')
    require(all(re.fullmatch(p, w, flags=re.ASCII)
                for p, w in zip(patterns, words[1:])), 'grammar')
    return words[0], words[1:]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def digest(value):
    return 'sha256:' + hashlib.sha256(canonical(value)).hexdigest()


def read_json(path):
    require(not path.is_symlink(), 'symlink-state')
    with path.open('rb') as stream:
        return json.load(stream)


def sync_dir(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic(path, value, immutable=False):
    """Publish complete bytes; link is atomic and cannot overwrite admissions/receipts."""
    data = canonical(value) + b'\n'
    fd, temporary = tempfile.mkstemp(prefix='.pending-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if immutable:
            try:
                os.link(temporary, path)
            except FileExistsError:
                require(path.read_bytes() == data, 'immutable-conflict')
        else:
            require(not path.is_symlink(), 'symlink-state')
            os.replace(temporary, path)
        sync_dir(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Lock:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        # Installer creates this file. Read-only actions never create lock/state.
        self.fd = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(self.fd)
            raise Denied('busy') from None
        return self

    def __exit__(self, *args):
        os.close(self.fd)


def trusted(path, directory=False):
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'trusted-path')
    for item in [path, *path.parents]:
        info = item.lstat()
        require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0
                and not info.st_mode & 0o022, 'untrusted-installation')
    require(path.is_dir() if directory else path.is_file(), 'trusted-type')
    return path


def private_file_digest(path):
    """Hash private bytes without returning values; recheck root trust on every use."""
    def identity(info):
        # Reads may advance atime; content/ownership changes must still fail closed.
        return (info.st_dev, info.st_ino, info.st_size, info.st_uid, info.st_gid,
                info.st_mode, info.st_mtime_ns, info.st_ctime_ns)

    require(isinstance(path, (str, Path)) and str(Path(path)) == str(path), 'trusted-path')
    path = trusted(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0
                and not before.st_mode & 0o022 and before.st_size <= 16 * 1024**2,
                'trusted-input-size')
        checksum = hashlib.sha256()
        total = 0
        while chunk := stream.read(65536):
            total += len(chunk)
            require(total <= 16 * 1024**2, 'trusted-input-size')
            checksum.update(chunk)
        after = os.fstat(stream.fileno())
        require(identity(before) == identity(after) and total == before.st_size
                and identity(path.stat()) == identity(after),
                'trusted-input-changed')
    return 'sha256:' + checksum.hexdigest()


def validate_backup_identity(identity):
    require(isinstance(identity, dict) and set(identity) == {
        'wrapper', 'config_path', 'stanza', 'repository', 'repository_id', 'system_identifier'},
        'backup-identity-config')
    require(all(isinstance(identity[k], str) and re.fullmatch(r'[a-zA-Z0-9_.-]{1,100}', identity[k])
                for k in ('stanza', 'repository_id'))
            and isinstance(identity['repository'], str)
            and re.fullmatch(r'[1-9][0-9]{0,3}', identity['repository'])
            and isinstance(identity['system_identifier'], str)
            and re.fullmatch(r'[1-9][0-9]{0,19}', identity['system_identifier']), 'backup-identity-config')
    for key in ('wrapper', 'config_path'):
        value = identity[key]
        require(isinstance(value, str) and Path(value).is_absolute()
                and str(Path(value)) == value and '..' not in Path(value).parts, 'backup-identity-config')


def load_config():
    config = read_json(trusted(CONFIG))
    expected = {'version', 'environment', 'state', 'inbox', 'adapter',
                'project', 'project_directory', 'compose_files', 'env_files',
                'fenced_units', 'required_non_targets', 'migration_root',
                'max_archive_bytes', 'backup_max_age_seconds', 'evidence_max_age_seconds',
                'probe_attempts', 'probe_interval_seconds', 'backup_identity'}
    require(set(config) == expected and config['version'] == 1
            and config['environment'] == 'production-hetzner', 'components-config')
    require(re.fullmatch(r'[a-z][a-z0-9-]{0,62}', config['project']), 'project')
    for field in ('state', 'inbox', 'project_directory'):
        trusted(config[field], directory=True)
    require(Path(config['inbox']).parent == Path(config['state']), 'inbox-boundary')
    for field in ('compose_files', 'env_files'):
        require(isinstance(config[field], list) and config[field], 'compose-inputs')
        for path in config[field]:
            trusted(path)
    validate_backup_identity(config['backup_identity'])
    trusted(config['backup_identity']['config_path'])
    trusted(config['backup_identity']['wrapper'])
    trusted(config['adapter'])
    require(os.access(config['adapter'], os.X_OK), 'adapter-not-executable')
    for field in ('admissions', 'receipts', 'transactions', 'overrides', 'imports'):
        trusted(Path(config['state']) / field, directory=True)
    trusted(Path(config['state']) / 'controller.lock')
    for field, ceiling in [('max_archive_bytes', 100_000_000_000),
                           ('backup_max_age_seconds', 86400),
                           ('evidence_max_age_seconds', 300), ('probe_attempts', 120),
                           ('probe_interval_seconds', 60)]:
        require(type(config[field]) is int and 0 < config[field] <= ceiling, field)
    required = {'jev-agent-runtime', 'jev-intelligence-worker', 'social-x-collector'}
    require(isinstance(config['required_non_targets'], dict)
            and required <= set(config['required_non_targets'])
            and 'api' not in config['required_non_targets']
            and all(re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}', n)
                    for n in config['required_non_targets'].values()), 'non-targets')
    require(isinstance(config['fenced_units'], list) and config['fenced_units']
            and all(re.fullmatch(r'[a-zA-Z0-9@_.-]+\.(timer|service)', u)
                    for u in config['fenced_units']), 'fenced-units')
    root = config['migration_root']
    require(re.fullmatch(r'/[a-zA-Z0-9_./-]+', root) and '..' not in root.split('/'),
            'migration-root')
    require(Path(config['project_directory']) != Path(config['state']), 'code-boundary')
    return config


def fresh(timestamp, age):
    require(type(timestamp) is int and 0 <= time.time() - timestamp <= age, 'stale-evidence')
