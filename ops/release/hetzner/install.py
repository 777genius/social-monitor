#!/usr/bin/python3 -I
"""Manual trusted bootstrap. A plan is the default; never import candidate code."""
import sys
if __name__ == '__main__' and not sys.flags.isolated:
    print('{"mode":"plan","phase":"denied","reason":"isolated-python-required"}')
    raise SystemExit(1)
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import pwd
import grp
import re
import stat
import struct
import subprocess
import tempfile

MACHINE = 'b28fc7b17042414386eb9b114046e50c'
CODE = Path('/opt/social-monitor-release')
PYTHON = Path('/opt/social-monitor-release-python')
STATE = Path('/var/lib/social-monitor-release')
HOME = Path('/var/lib/sm-release')
COMPONENTS = Path('/etc/social-monitor/release/components.conf')
OPERATOR = Path('/etc/social-monitor/release/operator.conf')
ADAPTER = Path('/etc/social-monitor/release/operator-adapter')
USER = 'sm-release'
FORCED = '/usr/bin/sudo -n /opt/social-monitor-release/root-executor'
BASE_FILES = ('controller.py', 'contract.py', 'archive.py', 'bounds.py', 'evidence.py',
              'host.py', 'compose_contract.py', 'requirements.txt', 'release-gate.sh',
              'restricted-executor.c')
# Only reviewed operator assets may be added to this finite installation list.
# Until the operator lane supplies this closure in the approved SHA, install denies.
OPERATOR_FILES = ('operator-adapter', 'operator_adapter.py', 'operator_config.py',
                  'operator_github.py', 'operator_backup.py', 'operator_database.py',
                  'operator_probe.py')
WHEEL = 'pyyaml-6.0.3-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl'
WHEEL_HASH = 'ba1cc08a7ccde2d2ec775841541641e4548226580ab850948cbfda66a1befcdc'
SAFE_ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C',
            'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
            'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_OPTIONAL_LOCKS': '0', 'GIT_NO_LAZY_FETCH': '1',
            'GIT_TERMINAL_PROMPT': '0', 'GIT_ALLOW_PROTOCOL': ''}


class Denied(Exception):
    pass


def require(ok, reason):
    if not ok:
        raise Denied(reason)


def trusted(path, directory=False, private=False):
    require(str(path) == str(Path(path)), 'canonical-path')
    path = Path(path)
    require(path.is_absolute() and str(path) == os.path.normpath(str(path))
            and '..' not in path.parts, 'canonical-path')
    for item in (path, *path.parents):
        info = item.lstat()
        require(info.st_uid == 0 and not info.st_mode & 0o022
                and not stat.S_ISLNK(info.st_mode), 'root-trust')
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), 'file-type')
    if private:
        require(stat.S_IMODE(info.st_mode) == 0o600, 'private-config-mode')
    return path


def bounded(path, ceiling=1024 * 1024, private=False):
    path = trusted(path, private=private)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= ceiling, 'file-bounds')
        data = stream.read(ceiling + 1)
        after = os.fstat(stream.fileno())
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mode', 'st_uid', 'st_gid',
                  'st_mtime_ns', 'st_ctime_ns')
        require(len(data) == before.st_size and len(data) <= ceiling
                and all(getattr(before, k) == getattr(after, k) for k in fields)
                and all(getattr(after, k) == getattr(path.stat(), k) for k in fields), 'file-changed')
    return data


def run(argv, **kwargs):
    try:
        result = subprocess.run(argv, env=SAFE_ENV, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=180, check=False, **kwargs)
    except (OSError, subprocess.SubprocessError):
        raise Denied('command-failed') from None
    require(result.returncode == 0 and len(result.stdout) <= 1024 * 1024, 'command-failed')
    return result.stdout


def git_check(source, sha, files, execute=run):
    require(isinstance(sha, str) and re.fullmatch(r'[0-9a-f]{40}', sha), 'approved-sha')
    prefix = ['/usr/bin/git', '--no-optional-locks', '--literal-pathspecs',
              '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
              '-c', 'core.attributesFile=/dev/null', '-c', 'diff.external=',
              '-c', 'core.pager=cat', '-C', str(source)]
    require(execute(prefix + ['rev-parse', '--verify', 'HEAD']).decode().strip() == sha, 'source-head')
    relative = ['ops/release/hetzner/' + name for name in files]
    listing = execute(prefix + ['ls-files', '--stage', '-z', '--', *relative]).decode().split('\0')
    tracked = {}
    for row in filter(None, listing):
        metadata, name = row.split('\t', 1)
        mode, blob, stage = metadata.split(' ')
        require(mode in ('100644', '100755') and stage == '0'
                and re.fullmatch(r'[0-9a-f]{40}', blob) and name in relative, 'source-tracked')
        tracked[name] = mode
    require(set(tracked) == set(relative), 'approved-adapter-missing')
    tree = execute(prefix + ['ls-tree', '-r', '--full-tree', '-z', 'HEAD', '--', *relative])
    head = {}
    for row in filter(None, tree.decode().split('\0')):
        metadata, name = row.split('\t', 1)
        mode, kind, blob = metadata.split(' ')
        require(kind == 'blob' and mode in ('100644', '100755') and name in relative, 'source-tracked')
        head[name] = (mode, blob)
    require(set(head) == set(relative), 'source-tracked')
    assets = {}
    for name in relative:
        mode, blob = head[name]
        require(tracked[name] == mode, 'source-dirty')
        # Never run git diff/status: repository clean filters can execute source hooks.
        index = next(row for row in listing if row.endswith('\t' + name))
        require(index.split(' ', 2)[1] == blob, 'source-dirty')
        data = bounded(Path(source) / name)
        actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        require(actual == blob and bool((Path(source) / name).stat().st_mode & 0o111)
                == (mode == '100755'), 'source-dirty')
        assets[Path(name).name] = data
    return assets



def configuration(components, operator):
    def load(path):
        data = bounded(path, private=True)
        def unique(pairs):
            result = {}
            for key, value in pairs:
                require(key not in result, 'duplicate-config-key')
                result[key] = value
            return result
        value = json.loads(data, object_pairs_hook=unique)
        require(isinstance(value, dict) and value, 'config-object')
        # Examples and incomplete discovery never become trusted production defaults.
        require(not re.search(rb'(?i)replace|placeholder|example|changeme', data), 'config-placeholder')
        return value
    c, o = load(components), load(operator)
    expected = {'version', 'environment', 'state', 'inbox', 'adapter', 'project',
                'project_directory', 'compose_files', 'env_files', 'fenced_units',
                'required_non_targets', 'migration_root', 'max_archive_bytes',
                'backup_max_age_seconds', 'evidence_max_age_seconds', 'probe_attempts',
                'probe_interval_seconds', 'backup_identity'}
    require(set(c) == expected and type(c['version']) is int and c['version'] == 1
            and c['environment'] == 'production-hetzner'
            and c['state'] == str(STATE) and c['inbox'] == str(STATE / 'inbox')
            and c['adapter'] == str(ADAPTER), 'components-contract')
    require(re.fullmatch(r'[a-z][a-z0-9-]{0,62}', c['project']), 'components-project')
    trusted(c['project_directory'], directory=True)
    for family in ('compose_files', 'env_files'):
        require(isinstance(c[family], list) and 0 < len(c[family]) <= 128, 'components-paths')
        for path in c[family]:
            bounded(path, 16 * 1024**2)
    identity = c['backup_identity']
    require(isinstance(identity, dict) and set(identity) == {'wrapper', 'config_path',
            'stanza', 'repository', 'repository_id', 'system_identifier'}, 'backup-config')
    for key in ('wrapper', 'config_path'):
        bounded(identity[key], 16 * 1024**2)
    for key, pattern in [('stanza', r'[a-zA-Z0-9_.-]{1,100}'),
                         ('repository_id', r'[a-zA-Z0-9_.-]{1,100}'),
                         ('repository', r'[1-9][0-9]{0,3}'),
                         ('system_identifier', r'[1-9][0-9]{0,19}')]:
        require(isinstance(identity[key], str) and re.fullmatch(pattern, identity[key]), 'backup-config')
    required = {'jev-agent-runtime', 'jev-intelligence-worker', 'social-x-collector'}
    require(isinstance(c['required_non_targets'], dict) and required <= set(c['required_non_targets'])
            and 'api' not in c['required_non_targets'] and all(isinstance(v, str)
            and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}', v)
            for v in c['required_non_targets'].values()), 'non-targets')
    require(isinstance(c['fenced_units'], list) and c['fenced_units'] and all(isinstance(v, str)
            and re.fullmatch(r'[a-zA-Z0-9@_.-]+\.(timer|service)', v)
            for v in c['fenced_units']), 'fenced-units')
    require(isinstance(c['migration_root'], str) and re.fullmatch(r'/[a-zA-Z0-9_./-]+', c['migration_root'])
            and '..' not in c['migration_root'].split('/'), 'migration-root')
    for key, ceiling in [('max_archive_bytes', 100_000_000_000), ('backup_max_age_seconds', 86400),
                         ('evidence_max_age_seconds', 300), ('probe_attempts', 120),
                         ('probe_interval_seconds', 60)]:
        require(type(c[key]) is int and 0 < c[key] <= ceiling, 'components-limit')
    # Operator's own approved config parser remains authoritative; no compatibility evidence fabricated here.
    require(o.get('version') == 1, 'operator-config-version')
    return c


def public_key(path):
    words = bounded(path, 4096).decode('ascii').strip().split(' ')
    require(len(words) == 2 and words[0] == 'ssh-ed25519', 'public-key')
    try:
        data = base64.b64decode(words[1], validate=True)
    except ValueError:
        raise Denied('public-key') from None
    require(len(data) == 51 and data[:19] == b'\0\0\0\x0bssh-ed25519\0\0\0\x20', 'public-key')
    return 'restrict,command="' + FORCED + '" ' + ' '.join(words) + '\n'


def static_elf(path):
    data = bounded(path, 16 * 1024**2)
    require(data[:7] == b'\x7fELF\x02\x01\x01' and len(data) >= 64, 'executor-elf')
    offset = struct.unpack_from('<Q', data, 32)[0]
    width, count = struct.unpack_from('<HH', data, 54)
    require(width == 56 and 0 < count < 1024 and offset + width * count <= len(data), 'executor-elf')
    types = [struct.unpack_from('<I', data, offset + i * width)[0] for i in range(count)]
    require(2 not in types and 3 not in types, 'executor-not-static') # PT_DYNAMIC / PT_INTERP


def sudoers():
    # Empty quoted argument specification means ONLY a no-argument root executor.
    return ('Defaults:' + USER + ' env_reset,!setenv\nDefaults:' + USER +
            ' env_keep += \"SSH_ORIGINAL_COMMAND\"\n' + USER + ' ALL=(root) NOPASSWD: '
            '/opt/social-monitor-release/root-executor ""\n').encode()


def absent(path):
    require(not path.exists() and not path.is_symlink(), 'installation-exists')
    trusted(path.parent, directory=True)


def write_new(path, data, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def prepare(options, execute=run):
    source = trusted(options.source, directory=True)
    require(all((source / 'ops/release/hetzner' / name).is_file() for name in OPERATOR_FILES),
            'approved-adapter-missing')
    require(Path(__file__).resolve() == source / 'ops/release/hetzner/install.py', 'bootstrap-source')
    files = BASE_FILES + OPERATOR_FILES + ('install.py',)
    assets = git_check(source, options.approved_sha, files, execute)
    assets.pop('install.py')
    configuration(options.components, options.operator)
    require(Path(options.components) == COMPONENTS and Path(options.operator) == OPERATOR, 'config-location')
    require(bounded(ADAPTER) == assets['operator-adapter'] and os.access(ADAPTER, os.X_OK), 'approved-adapter')
    key = public_key(options.public_key)
    wheel = trusted(options.pyyaml_wheel)
    require(wheel.name == WHEEL and hashlib.sha256(bounded(wheel, 16 * 1024**2)).hexdigest()
            == WHEEL_HASH, 'pyyaml-wheel')
    require(b'PyYAML==6.0.3' in assets['requirements.txt'] and WHEEL_HASH.encode()
            in assets['requirements.txt'], 'pyyaml-lock')
    return assets, key, wheel


def secure_venv(directory):
    directory = trusted(directory, directory=True)
    # CPython may create this compatibility alias even with --copies. Remove
    # only its exact root-created self alias; never follow/materialize arbitrary links.
    alias = directory / 'lib64'
    if alias.is_symlink():
        require(alias.lstat().st_uid == 0 and os.readlink(alias) == 'lib', 'venv-alias')
        trusted(directory / 'lib', directory=True)
        alias.unlink()
    for item in (directory, *directory.rglob('*')):
        trusted(item, directory=item.is_dir())
    trusted(directory / 'bin/python3')


def install(options):
    require(os.getuid() == 0 and os.geteuid() == 0, 'root-required')
    # Machine identity cannot be supplied or overridden by arguments/configuration.
    require(bounded('/etc/machine-id', 128).decode().strip() == MACHINE, 'machine-id')
    assets, key, wheel = prepare(options)
    for path in (CODE, PYTHON, STATE, HOME, Path('/etc/sudoers.d/sm-release')):
        absent(path)
    for database, lookup in ((pwd, pwd.getpwnam), (grp, grp.getgrnam)):
        try:
            lookup(USER)
        except KeyError:
            continue
        raise Denied('dedicated-account-exists')
    compiler = trusted(Path('/usr/bin/gcc').resolve())
    interpreter = trusted(Path('/usr/bin/python3').resolve())
    for program in ('/usr/sbin/visudo',
                    '/usr/sbin/groupadd', '/usr/sbin/useradd', '/usr/bin/sudo'):
        trusted(program)
    require(run([str(interpreter), '-I', '-B', '-c',
                 'import sys; print("%d.%d" % sys.version_info[:2])']).strip() == b'3.12', 'python-version')
    os.umask(0o077)
    # All compilation and sudoers validation precede installed assets/account writes.
    with tempfile.TemporaryDirectory(prefix='.sm-release-bootstrap-', dir='/opt') as scratch:
        scratch = Path(scratch)
        binary = scratch / 'executor'
        compiler_source = scratch / 'restricted-executor.c'
        write_new(compiler_source, assets['restricted-executor.c'], 0o600)
        run([str(compiler), '-static', '-O2', '-Wall', '-Wextra', '-Werror',
             '-o', str(binary), str(compiler_source)])
        static_elf(binary)
        rule = scratch / 'sudoers'
        write_new(rule, sudoers(), 0o600)
        run(['/usr/sbin/visudo', '-cf', str(rule)])
        CODE.mkdir(mode=0o755)
        CODE.chmod(0o755)
        for name, data in assets.items():
            write_new(CODE / name, data, 0o755 if name in ('release-gate.sh', 'operator-adapter') else 0o644)
        for name, mode in (('restricted-executor', 0o755), ('root-executor', 0o700)):
            write_new(CODE / name, binary.read_bytes(), mode)
        run([str(interpreter), '-I', '-B', '-m', 'venv', '--copies', str(PYTHON)])
        secure_venv(PYTHON)
        # Wheel bytes independently hash checked; lock enforces the same official digest. No sdist/hooks.
        run([str(PYTHON / 'bin/python3'), '-I', '-B', '-m', 'pip', 'install', '--no-index',
             '--only-binary=:all:', '--no-deps', '--require-hashes', '--find-links', str(wheel.parent),
             '-r', str(CODE / 'requirements.txt')])
        secure_venv(PYTHON)
        require(run([str(PYTHON / 'bin/python3'), '-I', '-B', '-c',
                     'import yaml; print(yaml.__version__)']).strip() == b'6.0.3', 'pyyaml-version')
        STATE.mkdir(mode=0o700)
        for name in ('inbox', 'admissions', 'imports', 'transactions', 'receipts', 'overrides'):
            (STATE / name).mkdir(mode=0o700)
        write_new(STATE / 'controller.lock', b'', 0o600)
        HOME.mkdir(mode=0o755)
        HOME.chmod(0o755)
        (HOME / '.ssh').mkdir(mode=0o755)
        (HOME / '.ssh').chmod(0o755)
        write_new(HOME / '.ssh/authorized_keys', key.encode(), 0o644)
        run(['/usr/sbin/groupadd', '--system', USER])
        run(['/usr/sbin/useradd', '--system', '--gid', USER, '--home-dir', str(HOME),
             '--no-create-home', '--shell', str(CODE / 'restricted-executor'), USER])
        write_new(Path('/etc/sudoers.d/sm-release'), sudoers(), 0o440)
    return {'mode': 'install', 'phase': 'installed-unqualified'}


class Parser(argparse.ArgumentParser):
    def error(self, message):
        print('{"phase":"denied","reason":"arguments"}')
        raise SystemExit(2)


def main(argv=None):
    parser = Parser(description=__doc__)
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--source', required=True)
    parser.add_argument('--approved-sha', required=True)
    parser.add_argument('--components', default=str(COMPONENTS))
    parser.add_argument('--operator', default=str(OPERATOR))
    parser.add_argument('--public-key', required=True)
    parser.add_argument('--pyyaml-wheel', required=True)
    options = parser.parse_args(argv)
    try:
        if options.install:
            result = install(options)
        else:
            try:
                prepare(options)
                blockers = []
            except Denied as error:
                blockers = [str(error)]
            except Exception:
                blockers = ['missing-or-invalid-trusted-input']
            result = {'mode': 'plan', 'ready': not blockers, 'blockers': blockers,
                      'required_machine_id': MACHINE, 'approval': 'manual-install-required', 'qualification': 'required'}
        print(json.dumps(result, separators=(',', ':')))
        return 0
    except Exception:
        print('{"mode":"install","phase":"denied"}')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
