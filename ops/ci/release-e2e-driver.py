#!/usr/bin/env python3
"""Disposable consumer driver. Execution is reserved for the integration operator.

No default Docker endpoint, image builds/pulls, external authority or credential
discovery. The harness may use only provision/cleanup and drive SSH itself.
"""
import hashlib
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid

DIGEST = r'sha256:[0-9a-f]{64}'
SHA = r'[0-9a-f]{40}'
SERVICES = ('api', 'postgres', 'ssh', 'jev-agent-runtime',
            'jev-intelligence-worker', 'social-x-collector')
OPERATIONS = ('provision', 'refuse-mutated-archive', 'refuse-wrong-identity',
              'refuse-short', 'refuse-long', 'refuse-grammar', 'refuse-archive-drift',
              'refuse-unknown-migration', 'refuse-pending-migration', 'refuse-rolled-migration',
              'activate', 'verify', 'rollback', 'auto-rollback',
              'failed-rollback-latch', 'reconcile', 'cleanup')
LIMIT = 1024 * 1024
ROOT = Path('/srv/fixture')


class Refused(Exception):
    pass


def need(condition, reason):
    if not condition:
        raise Refused(reason)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def digest(value):
    return 'sha256:' + hashlib.sha256(canonical(value)).hexdigest()


def hash_file(path):
    checksum = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            checksum.update(chunk)
    return 'sha256:' + checksum.hexdigest()


def regular(path, maximum=LIMIT):
    path = Path(path)
    need(path.is_absolute() and str(path) == str(path.resolve()), 'noncanonical-input')
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and not info.st_mode & 0o022
         and info.st_size <= maximum, 'unsafe-input-file')
    return path


def read_json(path):
    value = json.loads(regular(path).read_bytes())
    need(isinstance(value, dict), 'json-object-required')
    return value


def write_json(path, value):
    need(not path.is_symlink(), 'symlink-output')
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        name = stream.name
        stream.write(canonical(value) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(name, path)
    path.chmod(0o600)


def command(argv, *, data=None, source=None, timeout=180, env=None, allow_failure=False,
            include_stderr=False):
    """Bound both pipes and time; reap only the child we created. Never print logs."""
    need(data is None or source is None, 'stdin-conflict')
    clean = {'PATH': '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
             'HOME': '/nonexistent', 'LC_ALL': 'C', 'COMPOSE_DISABLE_ENV_FILE': '1'}
    clean.update(env or {})
    with tempfile.TemporaryFile() as input_file:
        if data is not None:
            input_file.write(data)
        input_file.seek(0)
        process = subprocess.Popen(argv, stdin=source or input_file, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, env=clean)
        outputs = {process.stdout: bytearray(), process.stderr: bytearray()}
        deadline = time.monotonic() + timeout
        try:
            with selectors.DefaultSelector() as selector:
                for pipe in outputs:
                    selector.register(pipe, selectors.EVENT_READ)
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    need(remaining > 0, 'command-timeout')
                    for event, _ in selector.select(min(remaining, 1)):
                        chunk = os.read(event.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(event.fileobj)
                        else:
                            outputs[event.fileobj].extend(chunk)
                            need(sum(map(len, outputs.values())) <= LIMIT, 'command-output-limit')
                process.wait(timeout=max(0.01, deadline - time.monotonic()))
            out = bytes(outputs[process.stdout])
            if include_stderr:
                out += bytes(outputs[process.stderr])
            need(allow_failure or process.returncode == 0, 'command-failed')
            return process.returncode, out
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()
            process.stderr.close()


def validate_fixture(path):
    path = regular(path)
    fixture = read_json(path)
    need(set(fixture) == {'version', 'directory', 'project', 'candidate_directory',
                         'baseline_image_id', 'candidate'} and fixture['version'] == 1,
         'fixture-schema')
    directory = Path(fixture['directory'])
    need(directory.is_absolute() and directory == directory.resolve() and path.parent == directory
         and re.fullmatch(r'sm-release-e2e-[a-zA-Z0-9_-]+', directory.name)
         and not directory.is_symlink(), 'fixture-directory')
    need(re.fullmatch(r'sm-rc-e2e-[0-9a-f]{16}', fixture['project']), 'fixture-project')
    need(re.fullmatch(DIGEST, fixture['baseline_image_id']), 'baseline-id')
    candidate = fixture['candidate']
    need(isinstance(candidate, dict) and re.fullmatch(SHA, candidate.get('sha', ''))
         and re.fullmatch(r'[0-9]{1,20}', candidate.get('ci_run_id', ''))
         and re.fullmatch(DIGEST, candidate.get('archive_sha256', ''))
         and re.fullmatch(DIGEST, candidate.get('image_id', ''))
         and candidate['image_id'] != fixture['baseline_image_id']
         and type(candidate.get('archive_bytes')) is int
         and 0 < candidate['archive_bytes'] <= 10_000_000_000, 'candidate-binding')
    inventory = candidate.get('migrations')
    need(isinstance(candidate.get('image_graph'), dict)
         and candidate['image_graph'].get('kind') == 'oci-manifest', 'native-single-manifest-required')
    need(isinstance(inventory, list) and inventory and len(inventory) <= 2000,
         'migration-inventory')
    need(all(isinstance(m, dict) and set(m) == {'name', 'checksum'}
             and re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', m['name'])
             and re.fullmatch(r'[0-9a-f]{64}', m['checksum']) for m in inventory)
         and inventory == sorted(inventory, key=lambda m: m['name'])
         and len({m['name'] for m in inventory}) == len(inventory), 'migration-inventory')
    candidate_dir = Path(fixture['candidate_directory'])
    need(candidate_dir.is_absolute() and candidate_dir == candidate_dir.resolve()
         and candidate_dir.is_dir() and candidate_dir != directory, 'candidate-directory')
    need(read_json(candidate_dir / 'manifest.json') == candidate, 'manifest-binding')
    archive = regular(candidate_dir / 'candidate.tar', 10_000_000_000)
    need(archive.stat().st_size == candidate['archive_bytes'], 'archive-size')
    return fixture


def prerequisites(path):
    path = regular(path)
    need(path.parent.name.startswith('sm-rc-e2e-inputs-'), 'prerequisite-scope')
    value = read_json(path)
    expected = {'version', 'consumer_host', 'consumer_id', 'fixture_image_id',
                'postgres_image_id', 'redis_image_id', 'migration_root',
                'sql_directory', 'bootstrap_directory', 'producer_host', 'producer_id',
                'toolchain_manifest', 'toolchain_sha256'}
    need(set(value) == expected and value['version'] == 2, 'prerequisite-schema')
    host = value['consumer_host']
    need(isinstance(host, str) and host.startswith('unix:///')
         and '/sm-rc-e2e-consumer-' in host and host.endswith('/docker.sock'), 'consumer-endpoint')
    socket = Path(host[7:])
    need(socket == socket.resolve() and stat.S_ISSOCK(socket.stat().st_mode), 'consumer-socket')
    need(os.environ.get('DOCKER_HOST') == host, 'whole-harness-consumer-required')
    producer = value['producer_host']
    need(isinstance(producer, str) and producer.startswith('unix:///')
         and producer != host and '/sm-rc-e2e-producer-' in producer
         and producer.endswith('/docker.sock'), 'distinct-test-producer-required')
    producer_socket = Path(producer[7:])
    need(producer_socket == producer_socket.resolve()
         and stat.S_ISSOCK(producer_socket.stat().st_mode), 'producer-socket')
    need(isinstance(value['producer_id'], str)
         and re.fullmatch(r'[A-Za-z0-9:_-]{8,128}', value['producer_id'])
         and value['producer_id'] != value['consumer_id'], 'distinct-producer-id')
    need(isinstance(value['consumer_id'], str) and re.fullmatch(r'[A-Za-z0-9:_-]{8,128}',
                                                              value['consumer_id']), 'consumer-id')
    for field in ('fixture_image_id', 'postgres_image_id', 'redis_image_id'):
        need(re.fullmatch(DIGEST, value[field]), 'preloaded-image-id')
    need(re.fullmatch(r'/[A-Za-z0-9_./-]+', value['migration_root'])
         and '..' not in value['migration_root'].split('/'), 'migration-root')
    for field in ('sql_directory', 'bootstrap_directory', 'toolchain_manifest'):
        item = Path(value[field])
        need(item == item.resolve() and item.is_relative_to(path.parent), 'prerequisite-path')
    toolchain = regular(value['toolchain_manifest'])
    need(toolchain.stat().st_uid == 0 and stat.S_IMODE(toolchain.stat().st_mode) == 0o600
         and hash_file(toolchain) == value['toolchain_sha256'], 'root-toolchain-binding')
    metadata = read_json(toolchain)
    need(metadata.get('version') == 1 and metadata.get('docker_version') == '29.8.1'
         and metadata.get('compose_version') == '5.5.1'
         and re.fullmatch(r'3\.12\.[0-9]+', metadata.get('python_version', ''))
         and isinstance(metadata.get('files'), dict) and metadata['files'],
         'reviewed-toolchain-required')
    return value


class Driver:
    def __init__(self, fixture_path):
        self.f = validate_fixture(fixture_path)
        self.directory = Path(self.f['directory'])
        self.runtime = self.directory / 'runtime'
        self.state_path = self.directory / '.driver.json'
        self.c = self.f['candidate']
        self.project = self.f['project']
        self.p = None

    def docker(self, *args, **kwargs):
        need(self.p is not None, 'consumer-not-bound')
        return command(['docker', '--host', self.p['consumer_host'], *args], **kwargs)

    def json_docker(self, *args):
        return json.loads(self.docker(*args)[1])

    def check_consumer(self):
        version = self.json_docker('version', '--format', '{{json .Server}}')
        info = self.json_docker('info', '--format', '{{json .}}')
        need(version['Version'] == '29.8.1'
             and info.get('ID') == self.p['consumer_id'] and info.get('OSType') == 'linux'
             and ['driver-type', 'io.containerd.snapshotter.v1'] in info.get('DriverStatus', []),
             'isolated-native-docker29-required')
        need(self.docker('compose', 'version', '--short')[1].strip() == b'5.5.1',
             'compose551-required')

    def compose(self, *args):
        return self.docker('compose', '--project-name', self.project,
                           '--project-directory', str(self.runtime),
                           '--env-file', str(self.runtime / 'metadata.env'),
                           '-f', str(self.runtime / 'compose.json'), *args)

    def producer(self, *args, **kwargs):
        need(self.p is not None, 'producer-not-bound')
        return command(['docker', '--host', self.p['producer_host'], *args], **kwargs)

    def check_producer(self, require_candidate=True):
        info = json.loads(self.producer('info', '--format', '{{json .}}')[1])
        version = json.loads(self.producer('version', '--format', '{{json .Server}}')[1])
        need(info.get('ID') == self.p['producer_id'] and info['ID'] != self.p['consumer_id']
             and version['Version'] == '29.8.1', 'producer-context-changed')
        if require_candidate:
            row = json.loads(self.producer('image', 'inspect', self.c['image_id'])[1])[0]
            need(row['Id'] == self.c['image_id'], 'immutable-producer-candidate-required')

    def container(self, service):
        ids = self.docker('ps', '-aq', '--filter', 'label=com.docker.compose.project=' + self.project,
                          '--filter', 'label=com.docker.compose.service=' + service)[1].split()
        need(len(ids) == 1, 'service-count')
        row = self.json_docker('inspect', ids[0].decode())[0]
        need(row['Config']['Labels']['com.docker.compose.project'] == self.project
             and row['Config']['Labels']['com.docker.compose.service'] == service,
             'service-ownership')
        return row

    def snapshot(self):
        result = {}
        for service in (*SERVICES, 'redis'):
            row = self.container(service)
            result[service] = {k: row[k] for k in ('Id', 'Image', 'State')}
            # Health timestamps may change; the required preservation fields cannot.
            result[service]['State'] = {k: row['State'][k] for k in ('StartedAt', 'Running')}
        return result

    def exec_ssh(self, *args, **kwargs):
        return self.docker('exec', '-i', self.container('ssh')['Id'], *args, **kwargs)

    def sql(self, query, user='sm_e2e_migrator'):
        return self.docker('exec', '-i', self.container('postgres')['Id'], 'psql', '-X', '-qAt',
                           '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', 'e2e',
                           data=query.encode())[1].decode().strip()

    def image_absent(self):
        images = self.docker('image', 'ls', '--all', '--no-trunc', '--quiet')[1].decode().split()
        need(self.c['image_id'] not in images, 'candidate-must-be-absent')
        code, _ = self.docker('image', 'inspect', self.c['image_id'], allow_failure=True)
        need(code != 0, 'candidate-must-be-absent')

    def persist(self, **fields):
        old = read_json(self.state_path) if self.state_path.exists() else {}
        write_json(self.state_path, {**old, **fields})

    def load(self, check_consumer=True):
        state = read_json(self.state_path)
        need(state.get('fixture_digest') == digest(self.f), 'fixture-state-binding')
        self.p = state['prerequisites']
        need(os.environ.get('DOCKER_HOST') == self.p['consumer_host'], 'consumer-context-changed')
        if check_consumer:
            self.check_consumer()
        return state

    def compose_model(self):
        def service(image, **extra):
            return {'image': image, 'pull_policy': 'never', 'restart': 'no', **extra}
        volume = lambda name, target, ro=False: {'type': 'volume', 'source': name,
                                               'target': target, 'read_only': ro}
        bind = lambda source, target: {'type': 'bind', 'source': str(source), 'target': target,
                                       'read_only': True, 'bind': {'create_host_path': False}}
        pg_mounts = [volume('pgdata', '/var/lib/postgresql'),
                     volume('pgsocket', '/var/run/postgresql'), volume('backup', '/var/lib/pgbackrest')]
        model = {'name': self.project, 'services': {
            'api': service(self.f['baseline_image_id'], environment=api_environment()),
            'postgres': service(self.p['postgres_image_id'], environment={
                'POSTGRES_USER': 'postgres', 'POSTGRES_DB': 'e2e',
                'POSTGRES_PASSWORD': 'synthetic-e2e-only',
                'PGDATA': '/var/lib/postgresql/18/docker',
                'POSTGRES_INITDB_ARGS': '--auth-local=trust --auth-host=scram-sha-256'},
                command=['postgres', '-c', 'unix_socket_directories=/var/run/postgresql',
                         '-c', 'archive_mode=on', '-c', 'wal_level=replica',
                         '-c', 'archive_command=pgbackrest --config=/etc/pgbackrest/e2e.conf '
                         '--stanza=production-main archive-push %p'],
                volumes=pg_mounts + [bind(self.runtime / 'backup.conf', '/etc/pgbackrest/e2e.conf')]),
            'ssh': service(self.p['fixture_image_id'],
                ports=[{'target': 22, 'published': '0', 'host_ip': '127.0.0.1', 'protocol': 'tcp'}],
                volumes=[{**bind(self.runtime, str(ROOT)), 'read_only': False},
                         volume('docker', '/run/sm-release-consumer'),
                         volume('pgdata', '/var/lib/postgresql', True),
                         volume('pgsocket', '/var/run/postgresql', True),
                         volume('backup', '/var/lib/pgbackrest')]),
            'redis': service(self.p['redis_image_id'], command=['redis-server', '--save', '',
                                                                     '--appendonly', 'no'])},
            'volumes': {name: {} for name in ('pgdata', 'pgsocket', 'backup')},
            'networks': {'default': {'internal': True}}}
        # This bind-backed named volume exists only inside the separate outer DIND.
        # The root must launch that daemon on this fixed in-container socket path.
        model['volumes']['docker'] = {'driver': 'local', 'driver_opts': {
            'type': 'none', 'o': 'bind', 'device': '/run/sm-release-consumer'}}
        # Identical TEST-only path in both daemon namespaces: producer Prisma
        # uses this disposable PG socket with --network none, never a host DB.
        model['volumes']['pgsocket'] = {'driver': 'local', 'driver_opts': {
            'type': 'none', 'o': 'bind', 'device': str(self.runtime / 'pgsocket')}}
        for name in SERVICES[3:]:
            model['services'][name] = service(self.p['fixture_image_id'],
                                              entrypoint=['/usr/bin/sleep', 'infinity'])
        return model

    def seed(self):
        self.check_producer()
        need(len(self.c['migrations']) == 103, 'qualified-exact103-required')
        for migration in self.c['migrations']:
            path = regular(Path(self.p['sql_directory']) / migration['name'] / 'migration.sql',
                           16 * 1024 * 1024)
            need(hash_file(path)[7:] == migration['checksum'], 'approved-sql-mismatch')
        names = sorted(p.name for p in Path(self.p['sql_directory']).iterdir() if p.is_dir())
        need(names == [m['name'] for m in self.c['migrations']], 'approved-sql-inventory')
        bootstrap = Path(self.p['bootstrap_directory'])
        hashes = {
            'reader-summary-publication-pre-migration.sql':
                '1d3d70d6587ab6c232a37fb1feaa0de098dee22bf973462b824b350407c428d0',
            'reader-summary-publication-post-migration.sql':
                '231876dc900c42981985d47ac073cfce7baa46805d3e5373c9a7863a470e3233',
            'reader-summary-publication-tenant-ownership.sql':
                'cd85a07a070102cb31b5b5e3523760111a6e2bc286fa307f43348366947b9d6a'}
        repository = Path(__file__).resolve().parents[2]
        for name, checksum in hashes.items():
            source = repository / ('scripts/sql' if 'tenant-ownership' in name else 'ops/deploy') / name
            need(hash_file(regular(bootstrap / name))[7:] == checksum
                 and hash_file(source)[7:] == checksum, 'canonical-bootstrap-source-mismatch')
        initial = self.runtime / 'initial-migrations'
        initial.mkdir(mode=0o755)
        first = [m for m in self.c['migrations']
                 if m['name'] < '20260716170000_reader_summary_fail_closed_publication']
        need(len(first) == 10, 'historical-first10-required')
        extractor = self.project + '-sql-input'
        need(self.producer('container', 'inspect', extractor, allow_failure=True)[0] != 0,
             'producer-container-collision')
        extracted = self.runtime / 'exact-image-migrations'
        extracted.mkdir(mode=0o755)
        try:
            self.producer('create', '--name', extractor, '--label',
                          'io.social-monitor.cicd-test=' + self.project, '--network', 'none',
                          '--entrypoint', '/usr/bin/true', self.c['image_id'])
            self.producer('cp', extractor + ':' + self.p['migration_root'] + '/.', str(extracted))
            actual = sorted(p.name for p in extracted.iterdir()
                            if p.is_dir() and (p / 'migration.sql').is_file())
            need(actual == names, 'immutable-image-sql-inventory')
            for migration in self.c['migrations']:
                need(hash_file(regular(extracted / migration['name'] / 'migration.sql',
                                       16 * 1024 * 1024))[7:] == migration['checksum'],
                     'immutable-image-sql-checksum')
            for migration in first:
                shutil.copytree(extracted / migration['name'], initial / migration['name'])
            lock = extracted / 'migration_lock.toml'
            if lock.exists():
                shutil.copyfile(regular(lock), initial / lock.name)
        finally:
            self.remove_producer_container(extractor)
        self.sql("CREATE ROLE sm_e2e_migrator LOGIN NOSUPERUSER NOCREATEDB CREATEROLE "
                 "INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'synthetic-e2e-only'; "
                 "CREATE ROLE e2e_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT "
                 "NOREPLICATION NOBYPASSRLS PASSWORD 'synthetic-e2e-only'; "
                 "CREATE ROLE e2e_system LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT "
                 "NOREPLICATION NOBYPASSRLS; CREATE ROLE social_monitor_summary_once NOLOGIN "
                 "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; "
                 "CREATE ROLE social_monitor_reader_summary_daily_terminal LOGIN NOSUPERUSER "
                 "NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; "
                 "ALTER ROLE social_monitor_reader_summary_daily_terminal SET search_path TO pg_catalog, public; "
                 "GRANT social_monitor_reader_summary_daily_terminal TO sm_e2e_migrator "
                 "WITH ADMIN TRUE, INHERIT FALSE, SET FALSE; "
                 "GRANT e2e_api TO sm_e2e_migrator WITH ADMIN TRUE, INHERIT FALSE, SET TRUE; "
                 "ALTER DATABASE e2e OWNER TO e2e_api; GRANT CREATE ON DATABASE e2e TO sm_e2e_migrator; "
                 "GRANT USAGE,CREATE ON SCHEMA public TO sm_e2e_migrator;", 'postgres')
        phases = []
        try:
            for phase in ('first10', 'pre', 'historical-create-window', 'full103', 'post'):
                if phase in ('first10', 'full103'):
                    self.migrate(initial if phase == 'first10' else None)
                elif phase == 'historical-create-window':
                    self.sql('SET ROLE social_monitor_public_schema_owner; GRANT CREATE ON SCHEMA public '
                             'TO social_monitor_reader_summary_publication_owner '
                             'GRANTED BY social_monitor_public_schema_owner; RESET ROLE;')
                else:
                    destination = '/tmp/sm-e2e-bootstrap'
                    if phase == 'pre':
                        self.docker('exec', self.container('postgres')['Id'], 'mkdir', '-p', destination)
                        self.docker('cp', str(bootstrap) + '/.', self.container('postgres')['Id'] + ':' + destination)
                    self.docker('exec', self.container('postgres')['Id'], 'psql', '-X',
                                '-U', 'sm_e2e_migrator', '-d', 'e2e', '-v', 'ON_ERROR_STOP=1',
                                '-v', 'runtime_role=e2e_api', '-v', 'system_runtime_role=e2e_system',
                                '-f', destination + '/reader-summary-publication-' + phase + '-migration.sql')
                phases.append({'phase': phase, 'completed': True})
        except Exception:
            _, logs = self.docker('logs', '--tail', '5000', self.container('postgres')['Id'],
                                  allow_failure=True, include_stderr=True)
            errors = [line for line in logs.decode(errors='replace').splitlines() if 'ERROR:' in line]
            write_json(self.directory / 'migration-failure.json',
                       {'phases': phases, 'first_postgres_sql_error': errors[0] if errors else None})
            raise
        observed = json.loads(self.sql('SELECT coalesce(json_agg(json_build_object('
            "'name',migration_name,'checksum',checksum,'finished_at',finished_at::text,"
            "'rolled_back_at',rolled_back_at::text) ORDER BY migration_name), '[]'::json) "
            'FROM public."_prisma_migrations";', 'postgres'))
        need(len(observed) == 103 and all(r['finished_at'] and r['rolled_back_at'] is None for r in observed)
             and [{k: r[k] for k in ('name', 'checksum')} for r in observed] == self.c['migrations'],
             'actual-prisma-history-mismatch')
        write_json(self.directory / 'migration-proof.json', {'phases': phases, 'history': observed,
            'image_id': self.c['image_id'], 'bootstrap_hashes': hashes, 'exact_inventory_matched': True})
        self.sql("CREATE ROLE e2e_observer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; "
                 "REVOKE CREATE,TEMP ON DATABASE e2e FROM PUBLIC; "
                 "REVOKE CREATE ON SCHEMA public FROM PUBLIC; "
                 "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC; "
                 "ALTER ROLE e2e_observer SET default_transaction_read_only=on; "
                 "GRANT CONNECT ON DATABASE e2e TO e2e_observer; "
                 "GRANT USAGE ON SCHEMA public TO e2e_observer; "
                 'GRANT SELECT ON public."_prisma_migrations" TO e2e_observer; '
                 'GRANT EXECUTE ON FUNCTION pg_control_system() TO e2e_observer;', 'postgres')

    def owned_producer_containers(self, names):
        result = []
        for name in names:
            ids = self.producer('ps', '-aq', '--no-trunc', '--filter',
                                'name=^/' + name + '$')[1].split()
            need(len(ids) <= 1, 'producer-cleanup-count')
            for raw in ids:
                identifier = raw.decode()
                row = json.loads(self.producer('container', 'inspect', identifier)[1])[0]
                need(row['Id'] == identifier and row['Name'] == '/' + name
                     and row['Config']['Labels'].get('io.social-monitor.cicd-test') == self.project
                     and row['Image'] == self.c['image_id'], 'producer-cleanup-ownership')
                result.append(identifier)
        return result

    def remove_producer_container(self, name):
        self.check_producer(require_candidate=False)
        identifiers = self.owned_producer_containers((name,))
        self.check_producer(require_candidate=False)
        for identifier in identifiers:
            self.producer('container', 'rm', '-f', identifier)
        need(not self.owned_producer_containers((name,)), 'producer-cleanup-incomplete')
        self.check_producer(require_candidate=False)

    def migrate(self, initial):
        self.check_producer()
        name = self.project + '-prisma'
        need(self.producer('container', 'inspect', name, allow_failure=True)[0] != 0,
             'producer-container-collision')
        user = 'e2e_api' if initial else 'sm_e2e_migrator'
        args = ['run', '--name', name, '--label', 'io.social-monitor.cicd-test=' + self.project,
                '--network', 'none', '--mount', 'type=bind,source=' + str(self.runtime / 'pgsocket')
                + ',target=/var/run/postgresql', '-e', 'DATABASE_URL=postgresql://' + user
                + '@localhost/e2e?host=/var/run/postgresql']
        if initial:
            args += ['--mount', 'type=bind,source=' + str(initial) + ',target='
                     + self.p['migration_root'] + ',readonly']
        args += ['--entrypoint', '/app/node_modules/.bin/prisma', self.c['image_id'], 'migrate', 'deploy']
        try:
            code, raw = self.producer(*args, timeout=300, allow_failure=True, include_stderr=True)
            log = self.directory / ('first10-prisma.log' if initial else 'full103-prisma.log')
            with log.open('xb') as stream:
                stream.write(raw)
            log.chmod(0o600)
            need(code == 0, 'real-prisma-deploy-failed')
        finally:
            self.remove_producer_container(name)

    def provision(self):
        need(not self.state_path.exists() and not self.runtime.exists(), 'fixture-already-started')
        self.p = prerequisites(os.environ.get('SM_RELEASE_E2E_PREREQUISITES', ''))
        self.check_consumer()
        self.check_producer()
        need(not self.docker('ps', '-aq', '--filter',
                            'label=com.docker.compose.project=' + self.project)[1].strip(),
             'project-already-exists')
        for kind in ('network', 'volume'):
            need(not self.docker(kind, 'ls', '-q', '--filter',
                                'label=com.docker.compose.project=' + self.project)[1].strip(),
                 'project-resources-already-exist')
        # Compose can adopt a preexisting resource by name despite foreign or
        # missing labels. Never seed a reused volume or join a foreign network.
        volume_names = set(self.docker('volume', 'ls', '--format', '{{.Name}}')[1].decode().split())
        network_names = set(self.docker('network', 'ls', '--format', '{{.Name}}')[1].decode().split())
        need(not volume_names.intersection(self.project + '_' + name
                                          for name in ('pgdata', 'pgsocket', 'backup', 'docker'))
             and self.project + '_default' not in network_names, 'fixture-resource-name-collision')
        # Persist ownership only after ruling out preexisting resources, before
        # our first mutation; a refused collision must never authorize cleanup.
        self.persist(version=1, fixture_digest=digest(self.f), prerequisites=self.p, prepared=False)
        self.image_absent()
        for image in (self.f['baseline_image_id'], self.p['fixture_image_id'],
                      self.p['postgres_image_id'], self.p['redis_image_id']):
            row = self.json_docker('image', 'inspect', image)[0]
            need(row['Id'] == image, 'preloaded-image-required')
        baseline = self.json_docker('image', 'inspect', self.f['baseline_image_id'])[0]
        revision = baseline['Config']['Labels'].get('org.opencontainers.image.revision', '')
        need(re.fullmatch(SHA, revision), 'synthetic-baseline-revision')
        need(baseline['Config']['Labels'].get('social-monitor.e2e-baseline') == 'true',
             'synthetic-baseline-required')
        need(baseline['Config']['Labels'].get('social-monitor.e2e-source-sha') == self.c['sha']
             and revision != self.c['sha'], 'same-source-distinct-baseline-labels')
        need(hash_file(Path(self.f['candidate_directory']) / 'candidate.tar')
             == self.c['archive_sha256'], 'archive-digest')
        core_archive = Path(__file__).resolve().parents[1] / 'release' / 'hetzner' / 'archive.py'
        verified = json.loads(command([sys.executable, '-I', '-B', str(core_archive),
            str(Path(self.f['candidate_directory']) / 'candidate.tar'), self.c['archive_sha256'],
            self.c['image_id'], self.c['sha'], self.c['ci_run_id'], self.p['migration_root']])[1])
        need(verified == {k: self.c[k] for k in ('migrations', 'image_graph')},
             'actual-image-inventory-mismatch')
        self.runtime.mkdir(mode=0o700)
        socket_directory = self.runtime / 'pgsocket'
        socket_directory.mkdir(mode=0o755)
        os.chown(socket_directory, 999, 999)
        (self.runtime / 'metadata.env').write_text('# synthetic fixture; no ambient .env\n')
        (self.runtime / 'metadata.env').chmod(0o600)
        (self.runtime / 'backup.conf').write_text(
            '[global]\nrepo1-type=posix\nrepo1-path=/var/lib/pgbackrest\nrepo1-retention-full=2\n'
            'log-level-console=error\nlog-level-file=off\nstart-fast=y\n'
            '[production-main]\npg1-path=/var/lib/postgresql/18/docker\n'
            'pg1-socket-path=/var/run/postgresql\npg1-user=postgres\npg1-database=e2e\n')
        (self.runtime / 'backup.conf').chmod(0o644)
        write_json(self.runtime / 'compose.json', self.compose_model())
        write_json(self.runtime / 'authority.json', authority(self.c, revision))
        write_json(self.runtime / 'consumer.json', {'version': 1, 'consumer_id': self.p['consumer_id']})
        shutil.copyfile(self.p['toolchain_manifest'], self.runtime / 'toolchain.json')
        (self.runtime / 'toolchain.json').chmod(0o600)
        key = self.directory / 'id_ed25519'
        command(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(key)])
        shutil.copyfile(str(key) + '.pub', self.runtime / 'authorized.pub')
        hostkey = self.runtime / 'ssh_host_ed25519_key'
        command(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(hostkey)])
        self.persist(prepared=True)
        self.compose('up', '-d', '--no-build', '--pull', 'never', 'postgres', 'redis', 'ssh', *SERVICES[3:])
        end = time.monotonic() + 45
        while True:
            code, _ = self.docker('exec', self.container('postgres')['Id'], 'pg_isready',
                                  '-U', 'postgres', '-d', 'e2e', allow_failure=True, timeout=10)
            if code == 0:
                break
            need(time.monotonic() < end, 'postgres-start-timeout')
            time.sleep(1)
        need(re.fullmatch(r'18[0-9]{4}', self.sql('SHOW server_version_num;', 'postgres')),
             'postgres18-required')
        end = time.monotonic() + 45
        while True:
            code, _ = self.exec_ssh('/usr/bin/test', '-f', '/run/social-monitor-release-e2e-ready',
                                    allow_failure=True, timeout=10)
            if code == 0:
                break
            need(time.monotonic() < end, 'ssh-bootstrap-timeout')
            time.sleep(1)
        need(self.docker('exec', self.container('postgres')['Id'], 'pgbackrest', '--version')[1]
             .decode().strip() == 'pgBackRest 2.59.1', 'pgbackrest-version')
        need(self.docker('exec', self.container('postgres')['Id'], 'id', '-u', 'postgres')[1].strip()
             == b'999', 'postgres-fixture-uid')
        self.seed()
        system_id = self.sql('SELECT system_identifier::text FROM pg_control_system();', 'postgres')
        need(re.fullmatch(r'[1-9][0-9]{0,19}', system_id)
             and system_id != '7688442011877063482', 'live-test-system-id')
        config = components(self.project, self.p['migration_root'], system_id,
                            self.c['archive_bytes'])
        self.exec_ssh('/opt/social-monitor-release-python/bin/python3', '-I', '-B',
                      '/opt/social-monitor-release-e2e/operator.py', 'initialize',
                      data=canonical(config))
        self.exec_ssh('/opt/social-monitor-release-python/bin/python3', '-I', '-B',
                      '/opt/social-monitor-release-e2e/operator.py', 'prepare-backup')
        self.compose('up', '-d', '--no-build', '--no-deps', '--pull', 'never', 'api')
        row = self.container('ssh')
        bindings = row['NetworkSettings']['Ports'].get('22/tcp')
        need(isinstance(bindings, list) and len(bindings) == 1
             and bindings[0]['HostIp'] == '127.0.0.1', 'ssh-loopback')
        port = int(bindings[0]['HostPort'])
        need(1024 < port < 65536, 'ssh-port')
        public = (Path(str(hostkey) + '.pub')).read_text().split()
        hosts = self.directory / 'known_hosts'
        hosts.write_text(f'[127.0.0.1]:{port} {public[0]} {public[1]}\n')
        hosts.chmod(0o600)
        connection = {'version': 1, 'ssh_port': port, 'ssh_key': str(key), 'known_hosts': str(hosts)}
        self.persist(connection=connection)
        self.ssh('status')
        # Independent real readiness, not a selector/configuration assertion.
        end = time.monotonic() + 45
        while True:
            result = json.loads(self.exec_ssh('/etc/social-monitor/release/operator-adapter', 'probe',
                data=canonical({'container_id': self.container('api')['Id'],
                                'image_id': self.f['baseline_image_id'], 'sha': revision}))[1])
            if result.get('ready') is True:
                break
            need(time.monotonic() < end, 'baseline-not-ready')
            time.sleep(1)
        self.image_absent()
        return connection

    def ssh(self, verb, source=None, denied=None):
        connection = read_json(self.state_path)['connection']
        args = ['ssh', '-F', '/dev/null', '-i', connection['ssh_key'], '-p', str(connection['ssh_port']),
                '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                '-o', 'UserKnownHostsFile=' + connection['known_hosts'], '-o', 'ConnectTimeout=10',
                'e2e@127.0.0.1', verb]
        if source:
            with Path(source).open('rb') as stream:
                code, out = command(args, source=stream, allow_failure=True)
        else:
            code, out = command(args, allow_failure=True)
        answer = json.loads(out)
        if denied:
            need(code == 1 and answer == {'denied': denied}, 'controller-denial-not-observed')
        else:
            need(code == 0 and isinstance(answer, dict), 'ssh-controller-failed')
        return answer

    def receive(self, archive=None, sha=None, denied=None):
        verb = ' '.join(map(str, ('receive', sha or self.c['sha'], self.c['ci_run_id'],
                                  self.c['archive_sha256'], self.c['image_id'], self.c['archive_bytes'])))
        return self.ssh(verb, archive or Path(self.f['candidate_directory']) / 'candidate.tar', denied)

    def refusal(self, operation):
        before = self.snapshot()
        if operation == 'refuse-grammar':
            result = self.ssh('unknown', denied='grammar')
        elif operation in ('refuse-short', 'refuse-long'):
            path = self.directory / 'bounded-upload.tar'
            need(not path.exists(), 'bounded-upload-path-exists')
            try:
                with path.open('xb') as output, (Path(self.f['candidate_directory']) / 'candidate.tar').open('rb') as original:
                    shutil.copyfileobj(original, output)
                    if operation == 'refuse-long':
                        output.write(b'x')
                if operation == 'refuse-short':
                    os.truncate(path, self.c['archive_bytes'] - 1)
                result = self.receive(path, denied='archive-short' if operation == 'refuse-short' else 'archive-long')
            finally:
                path.unlink(missing_ok=True)
        elif operation == 'refuse-archive-drift':
            self.receive()
            self.operator_action('archive-drift')
            try:
                result = self.ssh('admit ' + self.key(), denied='archive-digest')
            finally:
                self.operator_action('archive-drift')
        elif operation == 'refuse-mutated-archive':
            path = self.directory / 'mutated.tar'
            need(not path.exists(), 'mutated-path-exists')
            try:
                with path.open('xb') as output, (Path(self.f['candidate_directory']) / 'candidate.tar').open('rb') as original:
                    shutil.copyfileobj(original, output)
                with path.open('r+b') as stream:
                    byte = stream.read(1)
                    stream.seek(0)
                    stream.write(bytes([byte[0] ^ 1]))
                result = self.receive(path, denied='archive-digest')
            finally:
                path.unlink(missing_ok=True)
        elif operation == 'refuse-wrong-identity':
            wrong = ('e' if self.c['sha'][0] == 'f' else 'f') + self.c['sha'][1:]
            result = self.receive(sha=wrong, denied='image-labels')
        else:
            self.receive()
            history = 'SELECT coalesce(json_agg(row_to_json(m) ORDER BY id)::text,\'[]\') '
            history += 'FROM public."_prisma_migrations" m;'
            original = self.sql(history)
            identifier = str(uuid.uuid4())
            unknown = '99991231235959_e2e_' + identifier.replace('-', '')
            known = self.c['migrations'][0]
            name = unknown if operation == 'refuse-unknown-migration' else known['name']
            checksum = '0' * 64 if operation == 'refuse-unknown-migration' else known['checksum']
            finish = 'NULL' if operation == 'refuse-pending-migration' else 'now()'
            rolled = 'now()' if operation == 'refuse-rolled-migration' else 'NULL'
            try:
                self.sql('INSERT INTO public."_prisma_migrations" '
                         '(id,checksum,migration_name,finished_at,rolled_back_at,applied_steps_count) VALUES '
                         f"('{identifier}','{checksum}','{name}',{finish},{rolled},1);")
                expected = ('migration-required' if operation == 'refuse-unknown-migration'
                            else 'database-evidence')
                result = self.ssh('admit ' + self.key(), denied=expected)
            finally:
                self.sql('DELETE FROM public."_prisma_migrations" '
                         f"WHERE id='{identifier}' AND migration_name='{name}';")
            need(self.sql(history) == original, 'migration-history-not-restored')
        need(self.snapshot() == before, 'refusal-changed-container')
        self.image_absent()
        return {'version': 1, 'refused': True, 'reason': result['denied'], 'containers_unchanged': True}

    def key(self):
        return self.c['sha'] + ' ' + self.c['ci_run_id']

    def operator_action(self, verb):
        return json.loads(self.exec_ssh('/opt/social-monitor-release-python/bin/python3', '-I', '-B',
            '/opt/social-monitor-release-e2e/operator.py', verb,
            data=canonical({'key': self.c['sha'] + '-' + self.c['ci_run_id']}))[1])

    def non_targets(self):
        return {name: row for name, row in self.snapshot().items() if name != 'api'}

    def receipt(self, outcome, rollback=False):
        key = self.c['sha'] + '-' + self.c['ci_run_id'] + ('-rollback' if rollback else '')
        answer = self.ssh('receipt ' + key)
        need(answer.get('outcome') == outcome and answer.get('scope') == ['api']
             and all(answer.get(k) == self.c[k] for k in
                     ('sha', 'ci_run_id', 'image_id', 'archive_sha256', 'image_graph'))
             and answer.get('migration_status') == 'unchanged'
             and answer['snapshot_before_hash'] == answer['snapshot_after_hash'], 'actual-receipt-binding')
        write_json(self.directory / (key + '-receipt.json'), answer)
        return answer

    def lifecycle_fault(self, fail_previous):
        self.receive()
        self.ssh('admit ' + self.key())
        before = self.non_targets()
        disconnected = []
        stop = __import__('threading').Event()
        network = self.project + '_default'
        def isolate_targets():
            deadline, candidate_seen = time.monotonic() + 180, False
            while not stop.wait(0.1):
                need(time.monotonic() < deadline, 'fault-observation-deadline')
                try:
                    row = self.container('api')
                except Refused:
                    continue
                target = row['Image'] == self.c['image_id']
                previous = candidate_seen and fail_previous and row['Image'] == self.f['baseline_image_id']
                if (target or previous) and row['Id'] not in disconnected:
                    candidate_seen = candidate_seen or target
                    self.docker('network', 'disconnect', network, row['Id'])
                    disconnected.append(row['Id'])
                    if previous or target and not fail_previous:
                        return
        with ThreadPoolExecutor(max_workers=1) as pool:
            fault = pool.submit(isolate_targets)
            try:
                result = self.ssh('activate ' + self.key(),
                    denied='rollback-failed-latched' if fail_previous else 'rolled-back')
                fault.result(timeout=10)
                need(disconnected and self.non_targets() == before, 'real-fault-not-observed')
            finally:
                stop.set()
        if fail_previous:
            need(self.ssh('status')['latch'] is True, 'durable-latch-missing')
            self.ssh('activate ' + self.key(), denied='latched')
            row = self.container('api')
            need(row['Image'] == self.f['baseline_image_id'] and row['Id'] in disconnected,
                 'repair-previous-target-required')
            self.docker('network', 'connect', '--alias', 'api', network, row['Id'])
            self.ssh('rollback ' + self.key())
            self.receipt('rolled-back')
            need(self.ssh('status')['latch'] is True, 'controller-must-preserve-latch')
            self.operator_action('repair-latch')
            need(self.ssh('status')['latch'] is False, 'test-owner-latch-repair-failed')
        else:
            self.receipt('rolled-back')
        need(self.non_targets() == before, 'fault-changed-non-target')
        return {'version': 1, 'controller_denial': result['denied'],
                'actual_network_fault': True, 'non_targets_unchanged': True,
                'owner_repair': fail_previous}

    def run(self, operation):
        need(operation in OPERATIONS, 'unknown-operation')
        if operation == 'provision':
            return self.provision()
        if operation == 'cleanup' and not self.state_path.exists():
            return {'version': 1, 'cleaned': True, 'resources': 0}
        self.load(check_consumer=operation != 'cleanup')
        if operation == 'cleanup':
            return self.cleanup()
        if operation.startswith('refuse-'):
            return self.refusal(operation)
        if operation in ('auto-rollback', 'failed-rollback-latch'):
            return self.lifecycle_fault(operation == 'failed-rollback-latch')
        before = self.non_targets()
        if operation == 'activate':
            self.receive()
            self.ssh('admit ' + self.key())
        if operation == 'reconcile':
            old = self.receipt('activated')
            self.operator_action('interrupt-outcome')
            need(self.ssh('activate ' + self.key()) == old, 'actual-reconciliation-receipt-changed')
            result = self.ssh('verify ' + self.key())
        else:
            result = self.ssh(operation + ' ' + self.key())
        if operation == 'activate':
            self.receipt('activated')
            need(self.ssh('verify ' + self.key()).get('verified') is True, 'actual-verify-failed')
        elif operation == 'rollback':
            self.receipt('rolled-back', rollback=True)
            need(self.ssh('rollback ' + self.key()) == result, 'rollback-reconciliation-changed')
        need(self.non_targets() == before, 'lifecycle-changed-non-target')
        return result

    def resource_ids(self, kind):
        args = (('ps', '-aq', '--no-trunc') if kind == 'container'
                else (kind, 'ls', '-q', '--no-trunc') if kind == 'network'
                else (kind, 'ls', '-q'))
        return self.docker(*args, '--filter',
                           'label=com.docker.compose.project=' + self.project)[1].split()

    def cleanup(self):
        # Each daemon must independently prove identity and all ownership before deletion.
        count, unresolved = 0, {}
        kinds = ('container', 'network', 'volume')
        state = read_json(self.state_path)
        try:
            self.check_consumer()
            owned = []
            for kind in kinds:
                for raw in self.resource_ids(kind):
                    identifier = raw.decode()
                    row = self.json_docker(kind, 'inspect', identifier)[0]
                    labels = row['Config']['Labels'] if kind == 'container' else row['Labels']
                    need(labels.get('com.docker.compose.project') == self.project, 'cleanup-ownership')
                    need(row['Name' if kind == 'volume' else 'Id'] == identifier, 'cleanup-identity')
                    if kind == 'container':
                        need(labels.get('com.docker.compose.service') in (*SERVICES, 'redis'), 'cleanup-service')
                    owned.append((kind, identifier))
            if state.get('prepared') and not state.get('cleaned'):
                try:
                    _, exported = self.exec_ssh('/opt/social-monitor-release-python/bin/python3', '-I', '-B',
                        '/opt/social-monitor-release-e2e/operator.py', 'export-evidence')
                    write_json(self.directory / 'controller-evidence.json', json.loads(exported))
                except Exception:
                    self.persist(controller_evidence_unavailable=True)
            self.check_consumer()
            for kind, identifier in owned:
                self.docker(kind, 'rm', *(['-f'] if kind == 'container' else []), identifier)
                count += 1
            need(not any(self.resource_ids(kind) for kind in kinds), 'consumer-cleanup-incomplete')
            self.check_consumer()
        except Exception as error:
            unresolved['consumer'] = str(error) if isinstance(error, Refused) else 'consumer-cleanup-failed'
        try:
            self.check_producer(require_candidate=False)
            names = (self.project + '-prisma', self.project + '-sql-input')
            identifiers = self.owned_producer_containers(names)
            self.check_producer(require_candidate=False)
            for identifier in identifiers:
                self.producer('container', 'rm', '-f', identifier)
                count += 1
            need(not self.owned_producer_containers(names), 'producer-cleanup-incomplete')
            self.check_producer(require_candidate=False)
        except Exception as error:
            unresolved['producer'] = str(error) if isinstance(error, Refused) else 'producer-cleanup-failed'
        # Keep evidence and archives; keys are disposable after verified consumer cleanup.
        if 'consumer' not in unresolved:
            try:
                paths = (self.directory / 'id_ed25519', self.directory / 'id_ed25519.pub',
                         self.runtime / 'ssh_host_ed25519_key', self.runtime / 'ssh_host_ed25519_key.pub')
                need(all(not path.is_symlink() for path in paths), 'cleanup-symlink')
                for path in paths:
                    path.unlink(missing_ok=True)
            except Exception as error:
                unresolved['keys'] = str(error) if isinstance(error, Refused) else 'key-cleanup-failed'
        self.persist(cleaned=not unresolved, cleanup_unresolved=unresolved)
        return {'version': 1, 'cleaned': not unresolved, 'resources': count,
                'unresolved_cleanup': unresolved}


def api_environment():
    # Derived from the repository runtime selectors and actual readiness surface;
    # private network, no real runtime agents, provider keys or startup writers.
    return {'NODE_ENV': 'test', 'SOCIAL_MONITOR_RUNTIME_PROFILE': 'deterministic-test',
            'DATABASE_URL': 'postgresql://e2e_api:synthetic-e2e-only@postgres:5432/e2e',
            'COLLECTOR_RUNTIME_PROFILE': 'in-memory',
            'REDIS_URL': 'redis://redis:6379/0', 'SOCIAL_MONITOR_METRICS_MODE': 'in-memory',
            'MONITORING_PERSISTENCE': 'prisma', 'POSTGRES_RUNTIME_POOL_MIN': '0',
            'POSTGRES_RUNTIME_POOL_MAX': '2', 'POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS': '5000',
            'POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS': '10000',
            'READER_VALUE_SCORING_LOOP': 'disabled', 'INTELLIGENCE_READER_SUMMARY_JOB_LOOP': 'disabled',
            'INGESTION_SCAN_SCHEDULER_LOOP': 'disabled', 'INGESTION_SCAN_QUEUE_DRAIN_LOOP': 'disabled',
            'INTELLIGENCE_SUMMARY_JOB_LOOP': 'disabled', 'INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP': 'disabled',
            'INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP': 'disabled',
            'INTELLIGENCE_AUTO_SUMMARY_SCHEDULER': 'disabled',
            'INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP': 'disabled',
            'DELIVERY_DIGEST_SCHEDULER_LOOP': 'disabled', 'DELIVERY_ATTEMPT_DISPATCH_LOOP': 'disabled',
            'DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP': 'disabled', 'DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP': 'disabled',
            'EVENT_RELAY_LOOP': 'disabled',
            'INTELLIGENCE_SUMMARY_QUEUE_READER': 'in-memory', 'INGESTION_SCAN_QUEUE_READER': 'in-memory',
            'SUMMARY_MODEL_PROVIDER': 'deterministic', 'READER_SUMMARY_MODEL_PROVIDER': 'deterministic',
            'READER_SUMMARY_TOPIC_LABELER': 'deterministic', 'SUMMARY_MEMORY_MODE': 'disabled',
            'DELIVERY_WEBHOOK_PROVIDER': 'in-memory', 'TRUSTED_WORKSPACE_ROLE_HEADER': 'disabled'}


def authority(candidate, previous):
    paths = ['docs/ci/release-e2e-fixture.md']
    delta = digest({'base': previous, 'head': candidate['sha'], 'paths': paths,
                    'authority': 'synthetic-github-only'})
    return {'version': 1, 'authority': 'synthetic-github-only',
            'binding': {k: candidate[k] for k in ('sha', 'ci_run_id', 'archive_sha256', 'image_id')},
            'production_revision': previous, 'main_sha': candidate['sha'],
            'jobs': ['success'], 'legacy_workflow': 'disabled_manually', 'configured': True,
            'changed_paths': paths, 'delta_sha256': delta,
            'compatibility': {'base': previous, 'head': candidate['sha'], 'delta_sha256': delta,
                              'paths_sha256': digest(paths), 'independent_review': True,
                              'all_shared_dependencies_reviewed': True, 'compatible': True,
                              'evidence_sha256': digest({'synthetic_review': delta})}}


def components(project, migration_root, system_id, archive_bytes):
    return {'version': 1, 'environment': 'production-hetzner',
            'state': '/var/lib/social-monitor-release', 'inbox': '/var/lib/social-monitor-release/inbox',
            'adapter': '/etc/social-monitor/release/operator-adapter', 'project': project,
            'project_directory': str(ROOT), 'compose_files': [str(ROOT / 'compose.json')],
            'env_files': [str(ROOT / 'metadata.env')],
            'required_non_targets': {s: project + '-' + s + '-1' for s in SERVICES[3:]},
            'fenced_units': ['e2e-writer.timer', 'e2e-writer.service'],
            'migration_root': migration_root, 'max_archive_bytes': archive_bytes,
            'backup_max_age_seconds': 3600, 'evidence_max_age_seconds': 60,
            'probe_attempts': 30, 'probe_interval_seconds': 1,
            'backup_identity': {'wrapper': '/usr/local/sbin/pgbackrest-with-cipher-pass',
                'config_path': '/etc/pgbackrest/e2e.conf', 'stanza': 'production-main', 'repository': '1',
                'repository_id': 'repo-sha256-' + hashlib.sha256(canonical(
                    {'type': 'posix', 'path': '/var/lib/pgbackrest'})).hexdigest(),
                'system_identifier': system_id}}


if __name__ == '__main__':
    try:
        need(len(sys.argv) == 3, 'usage-operation-fixture')
        answer = Driver(Path(sys.argv[2])).run(sys.argv[1])
        print(canonical(answer).decode())
    except Exception as error:
        reason = str(error) if isinstance(error, Refused) else 'driver-operation-failed'
        print(canonical({'version': 1, 'error': reason}).decode())
        sys.exit(1)
