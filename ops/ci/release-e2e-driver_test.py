"""Offline regressions supplement root's real native qualification.

New regression rationale: accepting declared bytes without EOF permits stalled
or extended uploads. Kernel socket tests execute unchanged receive_bytes, not
a mock. An independent raw pgBackRest checksum preimage detects whitespace
reserialization. These tests cannot establish SSH/Docker/Prisma/backup success.
"""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
CORE = HERE.parent / 'release' / 'hetzner'
sys.path.insert(0, str(CORE))


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


driver = module('fixture_driver', HERE / 'release-e2e-driver.py')
operator = module('fixture_operator', HERE / 'release-e2e-fixture' / 'operator.py')
operator.CORE = CORE
native = module('fixture_native', HERE / 'release-e2e-native.py')
SHA = 'a' * 40
PREVIOUS_SHA = 'b' * 40
IMAGE = 'sha256:' + 'c' * 64
BASELINE = 'sha256:' + 'd' * 64
BINDING = {'sha': SHA, 'ci_run_id': '123', 'image_id': IMAGE,
           'archive_sha256': 'sha256:' + 'e' * 64}


class FixtureContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sm-release-e2e-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.candidate = self.root / 'candidate'
        self.candidate.mkdir()
        archive = self.candidate / 'candidate.tar'
        archive.write_bytes(b'synthetic archive contract only')
        archive.chmod(0o600)
        self.manifest = {**BINDING, 'archive_sha256': driver.hash_file(archive),
            'archive_bytes': archive.stat().st_size,
            'migrations': [{'name': '20261001000000_initial', 'checksum': 'f' * 64}],
            'image_graph': {'kind': 'oci-manifest'}}
        driver.write_json(self.candidate / 'manifest.json', self.manifest)
        self.fixture = {'version': 1, 'directory': str(self.root),
                        'project': 'sm-rc-e2e-0123456789abcdef',
                        'candidate_directory': str(self.candidate),
                        'baseline_image_id': BASELINE, 'candidate': self.manifest}
        self.path = self.root / 'fixture.json'
        driver.write_json(self.path, self.fixture)

    def change(self, **fields):
        driver.write_json(self.path, {**self.fixture, **fields})

    def test_fixture_is_bound_to_manifest_directory_and_random_project(self):
        self.assertEqual(driver.validate_fixture(self.path), self.fixture)
        for project in ('social-monitor-local', 'sm-rc-e2e-prod', 'sm-rc-e2e-' + 'a' * 17):
            self.change(project=project)
            with self.assertRaisesRegex(driver.Refused, 'fixture-project'):
                driver.validate_fixture(self.path)
        self.change(directory='/srv/production')
        with self.assertRaisesRegex(driver.Refused, 'fixture-directory'):
            driver.validate_fixture(self.path)

    def test_changed_manifest_and_archive_size_fail_before_any_docker(self):
        driver.write_json(self.candidate / 'manifest.json', {**self.manifest, 'ci_run_id': '999'})
        with self.assertRaisesRegex(driver.Refused, 'manifest-binding'):
            driver.validate_fixture(self.path)
        driver.write_json(self.candidate / 'manifest.json', self.manifest)
        with (self.candidate / 'candidate.tar').open('ab') as stream:
            stream.write(b'changed')
        with self.assertRaisesRegex(driver.Refused, 'archive-size'):
            driver.validate_fixture(self.path)

    def test_symlink_input_is_not_a_fixture_or_native_config(self):
        link = self.root / 'alias.json'
        link.symlink_to(self.path)
        with self.assertRaisesRegex(driver.Refused, 'noncanonical'):
            driver.validate_fixture(link)

    def test_compose_has_only_owned_mounts_and_sentinels(self):
        instance = driver.Driver(self.path)
        instance.p = {'postgres_image_id': BASELINE, 'fixture_image_id': IMAGE,
                      'redis_image_id': 'sha256:' + '1' * 64}
        model = instance.compose_model()
        self.assertEqual(set(model['services']), {*driver.SERVICES, 'redis'})
        self.assertTrue(model['networks']['default']['internal'])
        for name, service in model['services'].items():
            self.assertNotIn('build', service)
            self.assertEqual(service['pull_policy'], 'never')
            self.assertFalse(service.get('privileged', False))
            for mount in service.get('volumes', []):
                if mount['type'] == 'bind':
                    self.assertTrue(Path(mount['source']).is_relative_to(self.root))
            if name in driver.SERVICES[3:]:
                self.assertEqual(service['entrypoint'], ['/usr/bin/sleep', 'infinity'])
        self.assertEqual(model['services']['ssh']['ports'][0]['host_ip'], '127.0.0.1')
        self.assertEqual(model['volumes']['docker']['driver_opts']['device'], '/run/sm-release-consumer')

    def test_compose_isolates_application_network_from_loopback_ssh_transport(self):
        instance = driver.Driver(self.path)
        instance.p = {'postgres_image_id': BASELINE, 'fixture_image_id': IMAGE,
                      'redis_image_id': 'sha256:' + '1' * 64}
        model = json.loads(driver.canonical(instance.compose_model()))
        self.assertEqual(set(model['networks']), {'default', 'ssh_transport'})
        self.assertIs(model['networks']['default']['internal'], True)
        self.assertIs(model['networks']['ssh_transport']['internal'], False)
        self.assertEqual(model['networks']['ssh_transport']['driver'], 'bridge')
        self.assertEqual(model['services']['ssh']['networks'], ['ssh_transport'])
        self.assertEqual(model['services']['ssh']['ports'], [
            {'target': 22, 'published': '0', 'host_ip': '127.0.0.1', 'protocol': 'tcp'}])
        self.assertEqual(set(model['services']), {*driver.SERVICES, 'redis'})
        for name, service in model['services'].items():
            with self.subTest(service=name):
                self.assertNotIn('network_mode', service)
                if name != 'ssh':
                    self.assertNotIn('networks', service)
                    self.assertNotIn('ports', service)
                    self.assertNotIn('expose', service)

    def test_named_ssh_transport_collision_refuses_before_state_or_mutation(self):
        instance = driver.Driver(self.path)
        consumer = 'unix:///tmp/sm-rc-e2e-consumer-contract/docker.sock'
        producer = 'unix:///tmp/sm-rc-e2e-producer-contract/docker.sock'
        prerequisite_path = '/tmp/sm-rc-e2e-inputs-contract/prerequisites.json'
        prerequisites = {'consumer_host': consumer, 'consumer_id': 'consumer-contract',
                         'producer_host': producer, 'producer_id': 'producer-contract'}
        project_filter = 'label=com.docker.compose.project=' + instance.project
        observations = {
            (consumer, 'version', '--format', '{{json .Server}}'):
                driver.canonical({'Version': '29.8.1'}),
            (consumer, 'info', '--format', '{{json .}}'):
                driver.canonical({'ID': prerequisites['consumer_id'], 'OSType': 'linux',
                                  'DriverStatus': [['driver-type', 'io.containerd.snapshotter.v1']]}),
            (consumer, 'compose', 'version', '--short'): b'5.5.1\n',
            (producer, 'info', '--format', '{{json .}}'):
                driver.canonical({'ID': prerequisites['producer_id']}),
            (producer, 'version', '--format', '{{json .Server}}'):
                driver.canonical({'Version': '29.8.1'}),
            (producer, 'image', 'inspect', IMAGE): driver.canonical([{'Id': IMAGE}]),
            (consumer, 'ps', '-aq', '--filter', project_filter): b'',
            (consumer, 'network', 'ls', '-q', '--filter', project_filter): b'',
            (consumer, 'volume', 'ls', '-q', '--filter', project_filter): b'',
            (consumer, 'volume', 'ls', '--format', '{{.Name}}'): b'',
            # An unlabelled or foreign-labelled network is absent from the
            # project-label query above but present in this global name query.
            (consumer, 'network', 'ls', '--format', '{{.Name}}'):
                (instance.project + '_ssh_transport\n').encode(),
        }
        observed = []

        def command(argv, **kwargs):
            self.assertEqual(argv[:2], ['docker', '--host'])
            self.assertEqual(kwargs, {})
            key = tuple(argv[2:])
            self.assertIn(key, observations, 'unexpected Docker command or mutation')
            observed.append(key)
            return 0, observations[key]

        before = set(self.root.iterdir())
        with patch.dict(os.environ, {'DOCKER_HOST': consumer,
                                    'SM_RELEASE_E2E_PREREQUISITES': prerequisite_path}), \
             patch.object(driver, 'prerequisites', return_value=prerequisites) as inputs, \
             patch.object(driver, 'command', side_effect=command):
            with self.assertRaisesRegex(driver.Refused, '^fixture-resource-name-collision$'):
                instance.provision()
        inputs.assert_called_once_with(prerequisite_path)
        self.assertCountEqual(observed, list(observations))
        self.assertFalse(instance.state_path.exists())
        self.assertFalse(instance.runtime.exists())
        self.assertEqual(set(self.root.iterdir()), before)

    def test_cleanup_without_ownership_state_cannot_touch_daemon(self):
        with patch.object(driver.Driver, 'docker', side_effect=AssertionError('unexpected daemon')):
            self.assertEqual(driver.Driver(self.path).run('cleanup')['resources'], 0)

    def test_context_drift_fails_before_daemon_command(self):
        instance = driver.Driver(self.path)
        instance.persist(fixture_digest=driver.digest(self.fixture), prerequisites={
            'consumer_host': 'unix:///tmp/sm-rc-e2e-consumer-contract/docker.sock'})
        with patch.dict(os.environ, {'DOCKER_HOST': 'unix:///var/run/docker.sock'}), \
             patch.object(instance, 'check_consumer', side_effect=AssertionError('unexpected daemon')):
            with self.assertRaisesRegex(driver.Refused, 'consumer-context-changed'):
                instance.load()

    def test_test_configuration_rejects_production_id_and_success_executable(self):
        from contract import Denied
        core = driver.components(self.fixture['project'], '/app/prisma/migrations', '1234567', 10)
        data = {'version': 1, 'database': {'service': 'e2e_observer', 'database': 'e2e',
                'role': 'e2e_observer', 'host': '/var/run/postgresql', 'port': '5432'},
                'backup_config_sha256': IMAGE, 'wrapper_sha256': BASELINE}
        native.test_shape(core, data)
        for field, value in (('system_identifier', native.SYSTEM_ID), ('wrapper', '/bin/true')):
            changed = {**core, 'backup_identity': {**core['backup_identity'], field: value}}
            with self.assertRaises(Denied):
                native.test_shape(changed, data)
        with self.assertRaises(Denied):
            native.test_shape({**core, 'project': 'platform-social-monitor'}, data)

    def test_cleanup_rechecks_ownership_before_resource_removal(self):
        instance = driver.Driver(self.path)
        instance.persist(prepared=False)
        with patch.object(instance, 'check_consumer'), patch.object(instance, 'check_producer'), \
             patch.object(instance, 'producer', return_value=(1, b'')) as producer, \
             patch.object(instance, 'docker', return_value=(0, b'container-id\n')) as delete, \
             patch.object(instance, 'json_docker', return_value=[{'Config': {'Labels': {
                 'com.docker.compose.project': 'foreign-project', 'com.docker.compose.service': 'api'}}}]):
            result = instance.cleanup()
        self.assertFalse(result['cleaned'])
        self.assertEqual(result['unresolved_cleanup']['consumer'], 'cleanup-ownership')
        self.assertTrue(all('rm' not in call.args for call in delete.call_args_list))
        self.assertTrue(all('rm' not in call.args for call in producer.call_args_list))

    def test_unknown_migration_failure_still_restores_owned_row(self):
        instance = driver.Driver(self.path)
        queries = []
        def sql(query):
            queries.append(query)
            return '[]'
        with patch.object(instance, 'snapshot', return_value={}), \
             patch.object(instance, 'receive'), patch.object(instance, 'sql', side_effect=sql), \
             patch.object(instance, 'ssh', side_effect=driver.Refused('synthetic-denial-mismatch')):
            with self.assertRaisesRegex(driver.Refused, 'synthetic-denial-mismatch'):
                instance.refusal('refuse-unknown-migration')
        self.assertTrue(queries[1].startswith('INSERT INTO'))
        self.assertTrue(queries[2].startswith('DELETE FROM'))
        self.assertIn('AND migration_name=', queries[2])


class ObservationContracts(unittest.TestCase):
    def test_synthetic_authority_is_explicit_and_rejects_unknown_binding(self):
        authority = driver.authority(BINDING, PREVIOUS_SHA)
        request = {**BINDING, 'production_revision': PREVIOUS_SHA}
        answer = operator.github('release-evidence', request, authority)
        self.assertEqual(answer['main_sha'], SHA)
        self.assertEqual(answer['production_revision'], PREVIOUS_SHA)
        self.assertEqual(authority['authority'], 'synthetic-github-only')
        for field in request:
            bad = {**request, field: '9' * 40 if field.endswith('sha') or field == 'production_revision'
                   else 'unknown'}
            with self.assertRaises(operator.Refused):
                operator.github('release-evidence', bad, authority)

    def test_missing_jobs_and_compatibility_cannot_default_to_success(self):
        request = {**BINDING, 'production_revision': PREVIOUS_SHA}
        authority = driver.authority(BINDING, PREVIOUS_SHA)
        authority['jobs'] = []
        with self.assertRaisesRegex(operator.Refused, 'authority-jobs'):
            operator.github('release-evidence', request, authority)
        authority = driver.authority(BINDING, PREVIOUS_SHA)
        authority['compatibility']['independent_review'] = False
        from contract import Denied
        with self.assertRaisesRegex(Denied, 'compatibility-unreviewed'):
            operator.github('release-evidence', request, authority)


    def test_systemctl_is_finite_read_only_and_explicitly_synthetic(self):
        args = ['show', 'e2e-writer.timer',
                '--property=ActiveState,SubState,UnitFileState,ExecMainStartTimestampMonotonic']
        self.assertIn(b'UnitFileState=masked', operator.systemctl(args))
        for bad in (['start', 'e2e-writer.timer'], ['show', 'production.timer', args[2]], args + ['--all']):
            with self.assertRaises(operator.Refused):
                operator.systemctl(bad)

    def test_static_executor_gate_denies_dynamic_loader_and_needed_library(self):
        header = struct.pack('<16sHHIQQQIHHHHHH', b'\x7fELF\x02\x01\x01' + bytes(9),
                             2, 62, 1, 0, 64, 0, 0, 64, 56, 1, 0, 0, 0)
        segment = lambda kind, size=0: struct.pack('<IIQQQQQQ', kind, 0, 120, 0, 0, size, size, 8)
        operator.static_elf(header + segment(1))  # Synthetic structural header only.
        with self.assertRaisesRegex(operator.Refused, 'dynamic-ssh-executor-forbidden'):
            operator.static_elf(header + segment(3))
        with self.assertRaisesRegex(operator.Refused, 'dynamic-ssh-executor-forbidden'):
            operator.static_elf(header + segment(2, 16) + struct.pack('<qQ', 1, 1))
        with self.assertRaisesRegex(operator.Refused, 'static-executor-elf'):
            operator.static_elf(b'\x7fELF')

    def test_backup_has_no_configurable_success_executable(self):
        request = {**BINDING, 'executable': '/bin/true'}
        with patch.object(operator, 'run', side_effect=AssertionError('unexpected executor')):
            with self.assertRaisesRegex(operator.Refused, 'binding-invalid'):
                operator.backup(request, {})

    def test_requests_are_bounded_and_objects_only(self):
        for data in (b'[]', b'x' * (operator.LIMIT + 1)):
            with self.assertRaises(operator.Refused):
                operator.read_request(io.BytesIO(data))

    def test_command_deadline_output_limit_and_stderr_redaction(self):
        with self.assertRaisesRegex(driver.Refused, 'command-timeout'):
            driver.command([sys.executable, '-I', '-c', 'import time; time.sleep(2)'], timeout=0.05)
        with patch.object(driver, 'LIMIT', 1024):
            with self.assertRaisesRegex(driver.Refused, 'command-output-limit'):
                driver.command([sys.executable, '-I', '-c', 'print("x"*4096)'])
        with self.assertRaisesRegex(driver.Refused, '^command-failed$'):
            driver.command([sys.executable, '-I', '-c',
                            'import sys; sys.stderr.write("synthetic-sensitive-payload"); sys.exit(1)'])


class NativeRegressions(unittest.TestCase):
    def observe(self, payload, size, close=True):
        import bounds
        sender, receiver = socket.socketpair()
        try:
            sender.sendall(payload)
            if close:
                sender.shutdown(socket.SHUT_WR)
            with receiver.makefile('rb', buffering=0) as stream:
                output = io.BytesIO()
                bounds.receive_bytes(stream, output, size)
                return output.getvalue()
        finally:
            sender.close()
            receiver.close()

    def test_real_eof_short_extra_and_open_sender(self):
        import bounds
        from contract import Denied
        self.assertEqual(self.observe(b'abc', 3), b'abc')
        for payload, reason in ((b'ab', 'archive-short'), (b'abcd', 'archive-long')):
            with self.assertRaisesRegex(Denied, '^' + reason + '$'):
                self.observe(payload, 3)
        old = bounds.RECEIVE_SECONDS
        bounds.RECEIVE_SECONDS = 0.05
        try:
            with self.assertRaisesRegex(Denied, '^receive-deadline$'):
                self.observe(b'abc', 3, close=False)
        finally:
            bounds.RECEIVE_SECONDS = old

    def test_native_manifest_checksum_preserves_raw_json_whitespace(self):
        import hashlib
        import operator_backup
        from contract import Denied
        preimage = (b'{"backrest":{"backrest-format":5,"backrest-version":"2.59.1"},'
                    b'"backup":{"backup-label":"20261003-120000F","backup-type":"full",'
                    b'"backup-timestamp-start":100,"backup-timestamp-stop":101},'
                    b'"backup:db":{"db-id":1,"db-system-id":1234567,"db-version":"18"},'
                    b'"target:file":{"pg_data/PG_VERSION":{"size": 3}}}')
        checksum = hashlib.sha1(preimage).hexdigest()
        raw = (b'[backrest]\nbackrest-format=5\nbackrest-version="2.59.1"\n'
               b'[backup]\nbackup-label="20261003-120000F"\nbackup-type="full"\n'
               b'backup-timestamp-start=100\nbackup-timestamp-stop=101\n'
               b'[backup:db]\ndb-id=1\ndb-system-id=1234567\ndb-version="18"\n'
               b'[target:file]\npg_data/PG_VERSION={"size": 3}\n[backrest]\n'
               + b'backrest-checksum="' + checksum.encode() + b'"\n')
        proof = operator_backup.manifest(raw)
        self.assertTrue(proof['checksum_verified'])
        self.assertEqual(proof['sha256'], 'sha256:' + hashlib.sha256(raw).hexdigest())
        with self.assertRaisesRegex(Denied, 'operator-manifest-checksum'):
            operator_backup.manifest(raw.replace(b'{"size": 3}', b'{"size":3}'))


if __name__ == '__main__':
    unittest.main()
