#!/opt/social-monitor-release-python/bin/python3
"""Synthetic GitHub authority; real database/probe and approved native backup.

No production discovery and no configurable executable callbacks. The only
synthetic host command is the explicitly finite systemctl fence model.
"""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import stat
import struct
import subprocess
import sys
import tempfile
import time

CORE = Path('/opt/social-monitor-release')
ROOT = Path('/srv/fixture')
CONFIG = Path('/etc/social-monitor/release/components.conf')
PYTHON = '/opt/social-monitor-release-python/bin/python3'
EXECUTOR = CORE / 'restricted-executor'
ROOT_EXECUTOR = CORE / 'root-executor'
LIMIT = 1024 * 1024


class Refused(Exception):
    pass


def need(condition, reason):
    if not condition:
        raise Refused(reason)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def digest(value):
    return 'sha256:' + hashlib.sha256(canonical(value)).hexdigest()


def private(path):
    path = Path(path)
    need(path.is_absolute() and path == path.resolve(), 'noncanonical-private-input')
    for item in (path, *path.parents):
        info = item.lstat()
        need(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
             'untrusted-fixture-installation')
    need(path.is_file() and path.stat().st_size <= 16 * 1024**2, 'private-file-size')
    return path


def read_json(path):
    value = json.loads(private(path).read_bytes())
    need(isinstance(value, dict), 'json-object')
    return value


def run(argv, data=None, timeout=90):
    clean = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/nonexistent', 'LC_ALL': 'C',
             'COMPOSE_DISABLE_ENV_FILE': '1'}
    with tempfile.TemporaryFile() as source:
        source.write(data or b'')
        source.seek(0)
        process = subprocess.Popen(argv, stdin=source, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, env=clean)
        output = bytearray()
        size = 0
        end = time.monotonic() + timeout
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                selector.register(process.stderr, selectors.EVENT_READ)
                while selector.get_map():
                    remaining = end - time.monotonic()
                    need(remaining > 0, 'observation-timeout')
                    for event, _ in selector.select(min(remaining, 1)):
                        chunk = os.read(event.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(event.fileobj)
                        else:
                            size += len(chunk)
                            need(size <= LIMIT, 'observation-output-limit')
                            if event.fileobj is process.stdout:
                                output.extend(chunk)
                process.wait(timeout=max(0.01, end - time.monotonic()))
            need(process.returncode == 0, 'observation-command-failed')
            return bytes(output)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()
            process.stderr.close()


def read_request(stream):
    data = stream.read(LIMIT + 1)
    need(len(data) <= LIMIT, 'request-limit')
    request = json.loads(data or b'{}')
    need(isinstance(request, dict), 'request-object')
    return request


def binding(request):
    need(set(request) == {'sha', 'ci_run_id', 'archive_sha256', 'image_id'}
         and isinstance(request['sha'], str) and re.fullmatch(r'[0-9a-f]{40}', request['sha'])
         and isinstance(request['ci_run_id'], str) and re.fullmatch(r'[0-9]{1,20}', request['ci_run_id'])
         and all(isinstance(request[k], str) and re.fullmatch(r'sha256:[0-9a-f]{64}', request[k])
                 for k in ('archive_sha256', 'image_id')), 'binding-invalid')


def stamp(request, values):
    need(not set(request).intersection(values), 'observer-binding-collision')
    return {'version': 1, 'observed_at': int(time.time()), **request, **values}


def github(verb, request, authority):
    need(authority.get('version') == 1 and authority.get('authority') == 'synthetic-github-only',
         'synthetic-authority-missing')
    need(authority.get('configured') is True
         and authority.get('legacy_workflow') == 'disabled_manually', 'synthetic-authority-disabled')
    if verb == 'preflight':
        need(request == {}, 'preflight-binding')
        return stamp(request, {'configured': True, 'legacy_workflow': authority['legacy_workflow']})
    need(set(request) == {'sha', 'ci_run_id', 'archive_sha256', 'image_id', 'production_revision'},
         'github-request-fields')
    release = {k: v for k, v in request.items() if k != 'production_revision'}
    binding(release)
    need(release == authority.get('binding') and request['production_revision']
         == authority.get('production_revision'), 'synthetic-authority-binding')
    need(authority.get('main_sha') == release['sha'] and authority.get('jobs')
         and all(s == 'success' for s in authority['jobs']), 'synthetic-authority-jobs')
    values = {'event': 'push', 'branch': 'main', 'head_sha': authority['binding']['sha'],
              'main_sha': authority['main_sha'], 'jobs': authority['jobs'],
              'legacy_workflow': authority['legacy_workflow'], 'api_only': True,
              'schema_changed': False, 'worker_sensitive_changed': False,
              'diff_base': authority['production_revision'], 'diff_head': authority['main_sha'],
              'complete_delta': True, 'changed_paths': authority['changed_paths'],
              'delta_sha256': authority['delta_sha256'], 'compatibility': authority['compatibility']}
    # Execute the unchanged controller policy, including shared dependency proof.
    sys.path.insert(0, str(CORE))
    import evidence
    answer = stamp(request, values)
    evidence.compatibility(answer, request['production_revision'], release['sha'])
    return answer


def native():
    sys.path.insert(0, str(CORE))
    path = Path(__file__).resolve().parents[1] / 'release-e2e-native.py'
    if CORE == Path('/opt/social-monitor-release'):
        path = private('/opt/social-monitor-release-e2e/release-e2e-native.py')
    spec = importlib.util.spec_from_file_location('release_e2e_native', path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def identity():
    bridge = native()
    return stamp({}, bridge.operator_database.identity(bridge.TestConfiguration(), bridge.Runner()))


def database(request):
    binding(request)
    bridge = native()
    return stamp(request, bridge.operator_database.database(bridge.TestConfiguration(), bridge.Runner()))


def probe(request, config):
    sys.path.insert(0, str(CORE))
    from operator_adapter import request as validate_request
    validate_request('probe', canonical(request))
    bridge = native()
    configuration = bridge.TestConfiguration()
    need(configuration.core == config, 'probe-components-changed')
    return stamp(request, bridge.probe(configuration, bridge.Runner(), request))


def backup(request, config):
    binding(request)
    bridge = native()
    configuration = bridge.TestConfiguration()
    need(configuration.core == config, 'backup-components-changed')
    return stamp(request, bridge.operator_backup.backup(
        configuration, bridge.Runner(), request, int(time.time())))


def initialize(config):
    need(os.geteuid() == 0, 'root-initialization-required')
    need(config.get('project', '').startswith('sm-rc-e2e-')
         and config.get('project_directory') == str(ROOT)
         and config.get('state') == '/var/lib/social-monitor-release'
         and config.get('adapter') == '/etc/social-monitor/release/operator-adapter', 'initialization-scope')
    for family in ('inbox', 'admissions', 'receipts', 'transactions', 'overrides', 'imports'):
        path = Path(config['state']) / family
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.chmod(0o700)
    lock = Path(config['state']) / 'controller.lock'
    lock.touch(mode=0o600)
    lock.chmod(0o600)
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_bytes(canonical(config) + b'\n')
    CONFIG.chmod(0o600)
    consumer = read_json(ROOT / 'consumer.json')
    need(set(consumer) == {'version', 'consumer_id'} and consumer['version'] == 1
         and json.loads(run(['/usr/bin/docker', 'info', '--format', '{{json .ID}}']))
         == consumer['consumer_id'], 'ssh-consumer-daemon-mismatch')
    sys.path.insert(0, str(CORE))
    import contract
    need(read_json(ROOT / 'toolchain.json')
         == read_json('/opt/social-monitor-release-e2e/toolchain.json'), 'runtime-toolchain-mismatch')
    actual = stamp({}, native().initialize(config))
    need(actual['system_identifier'] == config['backup_identity']['system_identifier'], 'live-identity-drift')
    contract.load_config()
    return {'version': 1, 'initialized': True, 'system_identifier': actual['system_identifier']}


def prepare_backup(config):
    # Only the fixed disposable config/stanza/repository. No request options.
    args = [config['backup_identity']['wrapper'], '--config=/etc/pgbackrest/e2e.conf',
            '--stanza=production-main', '--repo=1']
    need(config['backup_identity']['stanza'] == 'production-main'
         and config['backup_identity']['config_path'] == '/etc/pgbackrest/e2e.conf', 'backup-scope')
    run(args + ['stanza-create'])
    run(args + ['--type=full', 'backup'], timeout=120)
    return {'version': 1, 'backup_command_completed': True}


def systemctl(args):
    need(len(args) == 3 and args[0] == 'show' and args[1] in ('e2e-writer.timer', 'e2e-writer.service')
         and args[2] == '--property=ActiveState,SubState,UnitFileState,ExecMainStartTimestampMonotonic',
         'synthetic-systemctl-grammar')
    return b'ActiveState=inactive\nSubState=dead\nUnitFileState=masked\nExecMainStartTimestampMonotonic=0\n'


def export_evidence(config):
    result = {}
    for family in ('admissions', 'receipts', 'transactions', 'imports'):
        paths = sorted((Path(config['state']) / family).glob('*.json'))
        need(len(paths) <= 16, 'evidence-file-limit')
        result[family] = {path.name: read_json(path) for path in paths}
    latch = Path(config['state']) / 'latch.json'
    result['latch'] = read_json(latch) if latch.exists() else None
    need(len(canonical(result)) <= LIMIT, 'evidence-output-limit')
    return {'version': 1, 'controller': result}


def verify_toolchain():
    metadata = read_json('/opt/social-monitor-release-e2e/toolchain.json')
    expected = {'version', 'base_image', 'docker_version', 'compose_version', 'python_version', 'files'}
    need(set(metadata) == expected and metadata['version'] == 1
         and re.fullmatch(r'[^\s]+@sha256:[0-9a-f]{64}', metadata['base_image']), 'reviewed-toolchain-required')
    docker_version = run(['/usr/bin/docker', '--version']).decode().strip()
    need(docker_version == 'Docker version ' + metadata['docker_version']
         or docker_version.startswith('Docker version ' + metadata['docker_version'] + ','),
         'docker-cli-version')
    need(metadata['docker_version'] == '29.8.1'
         and metadata['compose_version'] == '5.5.1'
         and re.fullmatch(r'3\.12\.[0-9]+', metadata['python_version']),
         'fixed-toolchain-versions')
    need(run(['/usr/bin/docker', 'compose', 'version', '--short']).decode().strip()
         == metadata['compose_version'], 'compose-version')
    need(run([PYTHON, '-I', '-c', 'import platform; print(platform.python_version())']).decode().strip()
         == metadata['python_version'], 'python-version')
    need(run([PYTHON, '-I', '-c', 'import yaml; print(yaml.__version__)']).strip() == b'6.0.3',
         'yaml-version')
    need(run(['/usr/bin/pgbackrest', '--version']).strip() == b'pgBackRest 2.59.1', 'pgbackrest-version')
    need(re.fullmatch(rb'psql \(PostgreSQL\) 18\.[0-9]+(?: \([^\n]*\))?',
                      run(['/usr/bin/psql', '--version']).strip()), 'psql18-version')
    files = metadata['files']
    required = {str(EXECUTOR), str(ROOT_EXECUTOR), *(str(CORE / n) for n in (
        'controller.py', 'contract.py', 'archive.py', 'bounds.py', 'evidence.py', 'host.py',
        'compose_contract.py', 'release-gate.sh', 'requirements.txt', 'install.py',
        'restricted-executor.c', 'operator_adapter.py', 'operator_config.py',
        'operator_github.py', 'operator_backup.py', 'operator_database.py', 'operator_probe.py'))}
    required |= {
        '/opt/social-monitor-release-e2e/operator.py',
        '/opt/social-monitor-release-e2e/release-e2e-native.py',
        '/opt/social-monitor-release-e2e/entrypoint.sh',
        PYTHON, '/opt/social-monitor-release-python/pyvenv.cfg',
        '/usr/bin/docker', '/usr/lib/postgresql/18/bin/psql', '/usr/bin/pgbackrest',
        '/usr/sbin/sshd', '/usr/bin/sudo', '/usr/bin/setpriv', '/usr/sbin/visudo',
    }
    # Copied Python and YAML closure cannot silently be omitted from the manifest.
    for path in Path('/opt/social-monitor-release-python').rglob('*'):
        need(not path.is_symlink(), 'python-closure-symlink')
        if path.is_dir():
            info = path.stat()
            need(info.st_uid == 0 and not info.st_mode & 0o022, 'python-closure-directory')
        else:
            required.add(str(path))
    need(isinstance(files, dict) and required <= set(files) and len(files) <= 10000,
         'toolchain-file-inventory')
    bridge = native()
    for name, checksum in files.items():
        need(isinstance(name, str)
             and name.startswith(('/opt/social-monitor-release/',
                                  '/opt/social-monitor-release-e2e/',
                                  '/opt/social-monitor-release-python/',
                                  '/usr/bin/', '/usr/sbin/', '/usr/lib/'))
             and '..' not in Path(name).parts
             and re.fullmatch(r'sha256:[0-9a-f]{64}', checksum), 'toolchain-file-path')
        maximum = bridge.NATIVE_FILE_LIMIT if name == '/usr/bin/docker' else 16 * 1024**2
        need(bridge.native_file_digest(name, maximum) == checksum,
             'toolchain-file-hash')
    executors = {}
    for path, mode in ((EXECUTOR, 0o755), (ROOT_EXECUTOR, 0o700)):
        need(stat.S_IMODE(private(path).stat().st_mode) == mode, 'non-setuid-executor-required')
        executors[path] = b''.join(bridge.native_file_chunks(path, 16 * 1024**2))
        static_elf(executors[path])
    need(executors[EXECUTOR] == executors[ROOT_EXECUTOR], 'executor-copy-mismatch')
    return {'version': 1, 'toolchain_verified': True}


def owner_action(verb, request, config):
    """Finite TEST faults/repair; no invented controller recovery override."""
    need(os.getuid() == 0 and os.geteuid() == 0, 'root-owner-action-required')
    need(set(request) == {'key'} and re.fullmatch(r'[0-9a-f]{40}-[1-9][0-9]{0,14}',
                                                request['key']), 'owner-action-key')
    sys.path.insert(0, str(CORE))
    from contract import atomic, read_json as state_json, sync_dir, Lock
    from controller import Controller
    from host import Host
    key, state = request['key'], Path(config['state'])
    with Lock(state / 'controller.lock'):
        item = state_json(state / 'imports' / (key + '.json'))
        need(key == item['sha'] + '-' + item['ci_run_id'], 'owner-import-binding')
        authority = read_json(ROOT / 'authority.json')
        need({k: item[k] for k in authority['binding']} == authority['binding'], 'owner-authority-binding')
        if verb == 'archive-drift':
            need(not (state / 'transactions' / (key + '.json')).exists(), 'archive-fault-before-transaction')
            path = state / 'inbox' / (key + '.tar')
            need(path.is_file() and not path.is_symlink()
                 and path.stat().st_size == item['archive_bytes'], 'archive-fault-path')
            with path.open('r+b') as stream:
                first = stream.read(1)
                need(len(first) == 1, 'archive-fault-byte')
                stream.seek(0)
                stream.write(bytes([first[0] ^ 1]))
                stream.flush()
                os.fsync(stream.fileno())
            return {'version': 1, 'test_archive_byte_toggled': True}
        tx_path = state / 'transactions' / (key + '.json')
        tx = state_json(tx_path)
        controller = Controller(config, Host(config))
        controller.fence()
        if verb == 'interrupt-outcome':
            receipt = state_json(state / 'receipts' / (key + '.json'))
            controller.receipt_binding(receipt, tx['admission'])
            controller.invariant(tx['admission'])
            need(tx.get('outcome') == 'activated' and receipt['outcome'] == 'activated',
                 'test-interrupt-terminal-activation')
            tx.pop('outcome')
            atomic(tx_path, tx)
            return {'version': 1, 'test_journal_outcome_interrupted': True}
        need(verb == 'repair-latch', 'owner-action-verb')
        latch = state_json(state / 'latch.json')
        receipt = state_json(state / 'receipts' / (tx.get('receipt_key', key) + '.json'))
        need(latch.get('key') == key and latch.get('reason') == 'rollback-failed'
             and tx.get('outcome') == 'rolled-back' and receipt.get('outcome') == 'rolled-back',
             'test-latch-repair-terminal-proof')
        controller.reconcile(key, tx)
        _, target = controller.invariant(tx['admission'])
        need(target['image'] == tx['admission']['previous_image_id'], 'test-repair-previous-image')
        (state / 'latch.json').unlink()
        sync_dir(state)
        return {'version': 1, 'test_owner_latch_removed': True}


def static_elf(data):
    """No interpreter or DT_NEEDED before the restricted executor clears env."""
    need(len(data) >= 64 and data[:7] == b'\x7fELF\x02\x01\x01', 'static-executor-elf')
    header = struct.unpack_from('<16sHHIQQQIHHHHHH', data)
    need(header[1] in (2, 3) and header[2] == 62 and header[8] == 64
         and header[9] == 56 and 0 < header[10] <= 256, 'static-executor-elf')
    offset, count = header[5], header[10]
    need(offset >= 64 and offset + count * 56 <= len(data), 'static-executor-elf')
    for index in range(count):
        segment = struct.unpack_from('<IIQQQQQQ', data, offset + index * 56)
        need(segment[0] not in (2, 3), 'dynamic-ssh-executor-forbidden')


def dispatch(verb, request):
    if verb == 'verify-toolchain':
        need(request == {}, 'toolchain-request')
        return verify_toolchain()
    if verb == 'initialize':
        return initialize(request)
    config = read_json(CONFIG)
    need(re.fullmatch(r'sm-rc-e2e-[0-9a-f]{16}', config.get('project', '')),
         'disposable-project-required')
    if verb in ('preflight', 'release-evidence'):
        return github(verb, request, read_json(ROOT / 'authority.json'))
    if verb == 'database':
        return database(request)
    if verb == 'postgres-identity':
        need(request == {}, 'identity-request')
        return identity()
    if verb == 'probe':
        return probe(request, config)
    if verb == 'backup':
        return backup(request, config)
    if verb == 'prepare-backup':
        need(request == {}, 'backup-prepare-request')
        return prepare_backup(config)
    if verb == 'export-evidence':
        need(request == {}, 'export-request')
        return export_evidence(config)
    if verb in ('archive-drift', 'interrupt-outcome', 'repair-latch'):
        return owner_action(verb, request, config)
    raise Refused('unknown-observer-operation')


if __name__ == '__main__':
    try:
        need(len(sys.argv) >= 2, 'observer-operation-required')
        if sys.argv[1] == 'systemctl':
            sys.stdout.buffer.write(systemctl(sys.argv[2:]))
        else:
            need(len(sys.argv) == 2, 'observer-arguments')
            print(canonical(dispatch(sys.argv[1], read_request(sys.stdin.buffer))).decode())
    except Exception as error:
        print(canonical({'denied': str(error) if isinstance(error, Refused) else 'observer-unavailable'}).decode())
        sys.exit(1)
