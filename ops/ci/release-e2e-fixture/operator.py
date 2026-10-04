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
    runner = bridge.Runner()
    probe_network_fault(request, config, bridge, runner)
    return stamp(request, bridge.probe(configuration, runner, request))


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
    state = Path(config['state'])
    need(not state.exists() and not state.is_symlink(), 'state-already-installed')
    state.mkdir(mode=0o700)
    state.chmod(0o700)
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
            '--stanza=production-main']
    need(config['backup_identity']['stanza'] == 'production-main'
         and config['backup_identity']['config_path'] == '/etc/pgbackrest/e2e.conf', 'backup-scope')
    run(args + ['stanza-create'])
    run(args + ['--repo=1', '--type=full', 'backup'], timeout=120)
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


FAULT_STATE = Path('/var/lib/social-monitor-release')
FAULT_MODES = ('candidate', 'failed-rollback')
FAULT_FIELDS = {
    'version', 'key', 'mode', 'project', 'import_sha256', 'admission_sha256',
    'authority_sha256', 'config_sha256', 'candidate_image', 'previous_image',
    'baseline_id', 'candidate_id', 'previous_id', 'disconnected',
}


def fault_paths(config):
    need(os.getuid() == 0 and os.geteuid() == 0, 'root-network-fault-required')
    need(config.get('state') == str(FAULT_STATE)
         and config.get('project_directory') == str(ROOT)
         and re.fullmatch(r'sm-rc-e2e-[0-9a-f]{16}', config.get('project', '')),
         'network-fault-scope')
    info = FAULT_STATE.lstat()
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == 0
         and stat.S_IMODE(info.st_mode) == 0o700, 'network-fault-state')
    return FAULT_STATE / 'network-fault.json', FAULT_STATE / 'network-fault-arm.json'


def fault_json(path, protected=False):
    from contract import read_json as state_json
    path = private(path)
    if protected:
        need(stat.S_IMODE(path.stat().st_mode) == 0o600, 'network-fault-plan-mode')
    value = state_json(path)
    need(isinstance(value, dict), 'network-fault-object')
    return value


def fault_context(key, config):
    need(isinstance(key, str)
         and re.fullmatch(r'[0-9a-f]{40}-[1-9][0-9]{0,14}', key),
         'network-fault-key')
    state = Path(config['state'])
    item = fault_json(state / 'imports' / (key + '.json'))
    admission = fault_json(state / 'admissions' / (key + '.json'))
    authority = read_json(ROOT / 'authority.json')
    release = {k: item[k] for k in ('sha', 'ci_run_id', 'archive_sha256', 'image_id')}
    binding(release)
    need(key == release['sha'] + '-' + release['ci_run_id']
         and all(admission.get(k) == v for k, v in release.items()),
         'network-fault-admission-binding')
    github('release-evidence', {
        **release, 'production_revision': authority['production_revision']}, authority)
    previous = admission.get('previous_image_id')
    need(isinstance(previous, str) and re.fullmatch(r'sha256:[0-9a-f]{64}', previous)
         and previous != release['image_id'], 'network-fault-previous-image')
    values = {
        'version': 1, 'key': key, 'project': config['project'],
        'import_sha256': digest(item), 'admission_sha256': digest(admission),
        'authority_sha256': digest(authority), 'config_sha256': digest(config),
        'candidate_image': release['image_id'], 'previous_image': previous,
    }
    return values, admission, authority


def fault_plan(config, key=None):
    path, arm_path = fault_paths(config)
    need(path.exists() and arm_path.exists(), 'network-fault-plan-missing')
    plan, arm = fault_json(path, True), fault_json(arm_path, True)
    need(set(plan) == FAULT_FIELDS and set(arm) == FAULT_FIELDS
         and type(plan['version']) is int and plan['version'] == 1
         and plan['mode'] in FAULT_MODES, 'network-fault-plan-shape')
    values, admission, authority = fault_context(plan['key'], config)
    need(key is None or plan['key'] == key, 'network-fault-plan-key')
    need(all(plan[k] == v for k, v in values.items()), 'network-fault-plan-binding')
    markers = ('candidate_id', 'previous_id', 'disconnected')
    need(all(plan[k] == arm[k] for k in FAULT_FIELDS - set(markers))
         and arm['candidate_id'] is None and arm['previous_id'] is None
         and arm['disconnected'] == [], 'network-fault-arm-changed')
    need(isinstance(plan['baseline_id'], str)
         and re.fullmatch(r'[0-9a-f]{64}', plan['baseline_id']),
         'network-fault-baseline-id')
    for field in ('candidate_id', 'previous_id'):
        identifier = plan[field]
        need(identifier is None or isinstance(identifier, str)
             and re.fullmatch(r'[0-9a-f]{64}', identifier), 'network-fault-marker-id')
    completed = [plan[k] for k in ('candidate_id', 'previous_id') if plan[k] is not None]
    need(type(plan['disconnected']) is list and plan['disconnected'] == completed
         and len(set(completed)) == len(completed)
         and plan['baseline_id'] not in completed
         and (plan['previous_id'] is None or plan['candidate_id'] is not None
              and plan['mode'] == 'failed-rollback'), 'network-fault-marker-order')
    tx_path = Path(config['state']) / 'transactions' / (plan['key'] + '.json')
    tx = fault_json(tx_path) if tx_path.exists() or tx_path.is_symlink() else None
    need(tx is None or tx.get('admission') == admission, 'network-fault-transaction-binding')
    need(tx is not None or not completed, 'network-fault-transaction-missing')
    if tx is not None and 'outcome' in tx:
        need(tx['outcome'] == 'rolled-back' and plan['candidate_id'] is not None
             and (plan['mode'] == 'candidate' or plan['previous_id'] is not None),
             'network-fault-terminal-state')
    return path, plan, admission, authority, tx


def fault_live_api(config, bridge):
    raw = run(['/usr/bin/docker', 'ps', '-q', '--no-trunc', '--filter',
               'label=com.docker.compose.project=' + config['project'], '--filter',
               'label=com.docker.compose.service=api'])
    ids = raw.decode('ascii').split()
    need(len(ids) == 1 and re.fullmatch(r'[0-9a-f]{64}', ids[0]),
         'network-fault-api-count')
    value = bridge.decode(run(['/usr/bin/docker', 'inspect', '--format',
                               bridge.operator_probe.INSPECT, ids[0]]), 4096)
    bridge.exact(value, ('id', 'image', 'started', 'running', 'project', 'service'))
    need(value['id'] == ids[0] and value['project'] == config['project']
         and value['service'] == 'api' and value['running'] is True
         and isinstance(value['started'], str) and value['started']
         and isinstance(value['image'], str)
         and re.fullmatch(r'sha256:[0-9a-f]{64}', value['image']),
         'network-fault-api-ownership')
    return value


def arm_network_fault(verb, key, config, controller):
    from contract import atomic
    path, arm_path = fault_paths(config)
    need(not path.exists() and not path.is_symlink()
         and not arm_path.exists() and not arm_path.is_symlink(),
         'network-fault-already-armed')
    values, admission, _ = fault_context(key, config)
    tx_path = Path(config['state']) / 'transactions' / (key + '.json')
    need(not tx_path.exists() and not tx_path.is_symlink(), 'network-fault-before-transaction')
    _, target = controller.invariant(admission)
    row = fault_live_api(config, native())
    need(target['image'] == values['previous_image']
         and row['image'] == values['previous_image'], 'network-fault-current-baseline')
    plan = {
        **values, 'mode': 'failed-rollback' if verb == 'arm-rollback-network-fault' else 'candidate',
        'baseline_id': row['id'], 'candidate_id': None, 'previous_id': None, 'disconnected': [],
    }
    atomic(arm_path, plan, immutable=True)
    atomic(path, plan, immutable=True)
    fault_plan(config, key)
    return {'version': 1, 'network_fault_armed': True}


def probe_network_fault(request, config, bridge, runner):
    """Runs under the caller's controller lock; never acquire that lock here."""
    from contract import atomic
    path, arm_path = fault_paths(config)
    if not any(p.exists() or p.is_symlink() for p in (path, arm_path)):
        return
    path, plan, _, authority, tx = fault_plan(config)
    row = fault_live_api(config, bridge)
    need(row['id'] == request['container_id'] and row['image'] == request['image_id'],
         'network-fault-probe-target')
    field = 'candidate_id' if row['image'] == plan['candidate_image'] else 'previous_id'
    need(row['image'] == plan['candidate_image' if field == 'candidate_id' else 'previous_image']
         and request['sha'] == (plan['key'].rsplit('-', 1)[0] if field == 'candidate_id'
                                else authority['production_revision']), 'network-fault-probe-binding')
    # Use the native identification as well as the untranslated Docker labels.
    observed = bridge.operator_probe.inspect(runner, request['container_id'])
    need(observed['id'] == row['id'] and observed['image'] == row['image'],
         'network-fault-native-target')
    if field == 'previous_id' and plan['candidate_id'] is None:
        need(row['id'] == plan['baseline_id'], 'network-fault-baseline-changed')
        return
    if plan[field] is not None:
        need(row['id'] == plan[field], 'network-fault-container-changed')
        return
    need(tx is not None
         and ('outcome' not in tx or field == 'previous_id'
              and plan['mode'] == 'candidate' and tx['outcome'] == 'rolled-back')
         and row['id'] != plan['baseline_id'],
         'network-fault-live-transaction')
    if field == 'previous_id' and plan['mode'] == 'candidate':
        return
    need(fault_live_api(config, bridge) == row, 'network-fault-inspect-race')
    run(['/usr/bin/docker', 'network', 'disconnect', config['project'] + '_default', row['id']])
    plan[field] = row['id']
    plan['disconnected'].append(row['id'])
    atomic(path, plan)



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
        if verb in ('arm-network-fault', 'arm-rollback-network-fault'):
            return arm_network_fault(verb, key, config, Controller(config, Host(config)))
        if verb == 'network-fault-status':
            _, plan, _, _, _ = fault_plan(config, key)
            return {
                'version': 1, 'candidate_id': plan['candidate_id'],
                'previous_id': plan['previous_id'], 'disconnected': plan['disconnected'],
            }

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
    if verb in ('archive-drift', 'interrupt-outcome', 'repair-latch',
                'arm-network-fault', 'arm-rollback-network-fault',
                'network-fault-status'):
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
