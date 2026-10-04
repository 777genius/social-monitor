"""Offline repair regressions; no native daemons, installations or production hooks."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import unittest
import time
from datetime import datetime, timezone
from unittest.mock import patch

CI = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('e2e_contracts', CI / 'release-e2e-driver_test.py')
contracts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contracts)
driver, operator, native = contracts.driver, contracts.operator, contracts.native
from contract import Denied, private_file_digest
import evidence
import operator_database


def observed_history(rows):
    class Configuration:
        db = {'service': 'e2e_observer', 'database': 'e2e', 'role': 'e2e_observer', 'port': '5432'}
        core = {'backup_identity': {'system_identifier': '1234567'}}

        def recheck(self):
            pass

    class Runner:
        def run(self, *args, **kwargs):
            return driver.canonical({
                'server_major': 18, 'system_identifier': '1234567',
                'database': 'e2e', 'role': 'e2e_observer', 'port': '5432',
                'transaction_read_only': True, 'read_only_role': True,
                'migrations': rows, 'history_complete': True,
                'history_context': {
                    'version': 1, 'system_identifier': '1234567', 'database': 'e2e',
                    'observer_role': 'e2e_observer', 'port': '5432',
                    'observed_at': datetime.now(timezone.utc).isoformat(timespec='microseconds'),
                    'relation': {'schema': 'public', 'name': '_prisma_migrations', 'oid': 16384, 'kind': 'r'},
                    'snapshot': {'id': '100:100:', 'isolation': 'repeatable read', 'read_only': True},
                    'visibility': {'complete': True, 'select': True, 'rls_enabled': False, 'rls_forced': False},
                    'row_count': len(rows)}})
    return {**operator_database.database(Configuration(), Runner()), 'observed_at': int(time.time())}


class Daemons:
    def __init__(self, instance):
        self.p, self.project = instance.p, instance.project
        self.calls, self.deleted = [], []
        labels = {'com.docker.compose.project': self.project}
        self.states = {}
        for role in ('consumer', 'producer'):
            self.states[self.p[role + '_host']] = {
                'ID': self.p[role + '_id'], 'online': True, 'foreign': None,
                'container': {}, 'network': {}, 'volume': {}}
        consumer = self.states[self.p['consumer_host']]
        consumer['container']['consumer-api'] = {
            'Id': 'consumer-api', 'Image': instance.f['baseline_image_id'],
            'Config': {'Labels': {**labels, 'com.docker.compose.service': 'api'}}}
        consumer['network']['consumer-network'] = {'Id': 'consumer-network', 'Labels': labels}
        consumer['volume']['consumer-volume'] = {'Name': 'consumer-volume', 'Labels': labels}
        producer = self.states[self.p['producer_host']]
        for suffix in ('prisma', 'sql-input'):
            identifier = 'producer-' + suffix
            producer['container'][identifier] = {
                'Id': identifier, 'Name': '/' + self.project + '-' + suffix, 'Image': instance.c['image_id'],
                'Config': {'Labels': {'io.social-monitor.cicd-test': self.project}}}

    def command(self, argv, **kwargs):
        assert argv[:2] == ['docker', '--host'], 'unexpected boundary command'
        host, args = argv[2], argv[3:]
        self.calls.append((host, tuple(args)))
        state = self.states[host]
        driver.need(state['online'], 'command-failed')
        if args[0] == 'info':
            return 0, driver.canonical({
                'ID': state['ID'], 'OSType': 'linux', 'DriverStatus': [['driver-type', 'io.containerd.snapshotter.v1']]})
        if args[0] == 'version':
            return 0, driver.canonical({'Version': '29.8.1'})
        if args == ['compose', 'version', '--short']:
            return 0, b'5.5.1\n'
        if args[:2] == ['image', 'inspect']:
            return 1, b'[]'
        if args[0] == 'ps':
            rows = state['container']
            selector = args[-1]
            ids = [identifier for identifier, row in rows.items()
                   if (not selector.startswith('name=')
                       or re.fullmatch(selector[5:], row['Name']))]
            return 0, '\n'.join(ids).encode()
        kind, verb = args[:2]
        rows = state[kind]
        if verb == 'ls':
            return 0, '\n'.join(rows).encode()
        if verb == 'inspect':
            identifier = args[-1]
            row = copy.deepcopy(rows[identifier])
            if state['foreign'] == identifier:
                labels = row['Config']['Labels'] if kind == 'container' else row['Labels']
                labels.clear()
            return 0, driver.canonical([row])
        if verb == 'rm':
            identifier = args[-1]
            del rows[identifier]
            self.deleted.append((host, kind, identifier))
            return 0, b''
        raise AssertionError(('unexpected boundary command', argv))


class RepairContracts(unittest.TestCase):
    def setUp(self):
        contracts.FixtureContracts.setUp(self)

    def cleanup_fixture(self):
        instance = driver.Driver(self.path)
        instance.p = {'consumer_host': 'unix:///tmp/sm-rc-e2e-consumer-contract/docker.sock',
                      'producer_host': 'unix:///tmp/sm-rc-e2e-producer-contract/docker.sock',
                      'consumer_id': 'consumer-contract-001',
                      'producer_id': 'producer-contract-001'}
        instance.persist(fixture_digest=driver.digest(self.fixture),
                         prerequisites=instance.p, prepared=False, cleaned=False)
        return instance, Daemons(instance)

    def clean(self, instance, daemons):
        with patch.object(driver, 'command', side_effect=daemons.command), \
             patch.dict(os.environ, {'DOCKER_HOST': instance.p['consumer_host']}):
            return instance.run('cleanup')

    def test_producer_outage_allows_owned_consumer_cleanup_but_requires_retry(self):
        instance, daemons = self.cleanup_fixture()
        host = instance.p['producer_host']
        daemons.states[host]['online'] = False
        first = self.clean(instance, daemons)
        self.assertFalse(first['cleaned'])
        self.assertEqual(first['unresolved_cleanup'], {'producer': 'command-failed'})
        self.assertEqual(first['resources'], 3)
        self.assertFalse(driver.read_json(instance.state_path)['cleaned'])
        self.assertEqual({host for host, _, _ in daemons.deleted}, {instance.p['consumer_host']})
        daemons.states[host]['online'] = True
        second = self.clean(instance, daemons)
        self.assertTrue(second['cleaned'])
        self.assertEqual(second['resources'], 2)
        self.assertEqual(second['unresolved_cleanup'], {})
        self.assertTrue((self.candidate / 'candidate.tar').exists())

    def test_missing_candidate_image_does_not_gate_either_owned_cleanup(self):
        instance, daemons = self.cleanup_fixture()
        result = self.clean(instance, daemons)
        self.assertTrue(result['cleaned'])
        self.assertEqual(result['resources'], 5)
        self.assertFalse(any(args[:2] == ('image', 'inspect') for _, args in daemons.calls))
        self.assertTrue(all(not state[kind] for state in daemons.states.values() for kind in ('container', 'network', 'volume')))

    def test_foreign_daemon_identity_prevents_deletion_on_that_endpoint(self):
        for role, reason in (('consumer', 'isolated-native-docker29-required'),
                             ('producer', 'producer-context-changed')):
            with self.subTest(role=role):
                instance, daemons = self.cleanup_fixture()
                host = instance.p[role + '_host']
                daemons.states[host]['ID'] = 'foreign-daemon-001'
                result = self.clean(instance, daemons)
                self.assertFalse(result['cleaned'])
                self.assertEqual(result['unresolved_cleanup'][role], reason)
                self.assertFalse(any(deleted_host == host for deleted_host, _, _ in daemons.deleted))
                self.assertTrue(daemons.states[host]['container'])

    def test_all_labels_are_validated_before_any_deletion_on_that_endpoint(self):
        for role, identifier, reason in (
                ('consumer', 'consumer-volume', 'cleanup-ownership'),
                ('producer', 'producer-sql-input', 'producer-cleanup-ownership')):
            with self.subTest(role=role):
                instance, daemons = self.cleanup_fixture()
                host = instance.p[role + '_host']
                daemons.states[host]['foreign'] = identifier
                result = self.clean(instance, daemons)
                self.assertFalse(result['cleaned'])
                self.assertEqual(result['unresolved_cleanup'][role], reason)
                self.assertFalse(any(deleted_host == host for deleted_host, _, _ in daemons.deleted))
                self.assertTrue(daemons.states[host]['container'])

    def test_native_history_policy_and_driver_refusals_agree_and_restore_exact_rows(self):
        migration = self.manifest['migrations'][0]
        base = {
            'id': '00000000-0000-0000-0000-000000000001', 'applied_steps_count': 1, 'name': migration['name'], 'checksum': migration['checksum'],
            'started_at': '2026-10-03 12:00:00+00', 'finished_at': '2026-10-03 12:01:00+00',
            'rolled_back_at': None}
        for operation, expected in (
                ('refuse-unknown-migration', 'migration-required'),
                ('refuse-pending-migration', 'database-evidence'),
                ('refuse-rolled-migration', 'database-evidence')):
            with self.subTest(operation=operation):
                instance = driver.Driver(self.path)
                rows = [copy.deepcopy(base)]

                def sql(query):
                    if query.startswith('SELECT'):
                        return json.dumps(rows, sort_keys=True)
                    if query.startswith('INSERT'):
                        values = re.fullmatch(
                            r"\('([^']+)','([^']+)','([^']+)',(NULL|now\(\)),(NULL|now\(\)),1\);",
                            query.split(' VALUES ', 1)[1])
                        self.assertIsNotNone(values)
                        identifier, checksum, name, finished, rolled = values.groups()
                        rows.append({'id': identifier, 'applied_steps_count': 1, 'name': name, 'checksum': checksum,
                                     'started_at': '2026-10-03 12:00:00+00', 'finished_at':
                                     None if finished == 'NULL' else '2026-10-03 12:01:00+00',
                                     'rolled_back_at': None if rolled == 'NULL' else '2026-10-03 12:02:00+00'})
                        return ''
                    if query.startswith('DELETE'):
                        identifiers = re.findall(r"'([^']*)'", query)
                        self.assertEqual(identifiers, [rows[-1]['id'], rows[-1]['name']])
                        rows.pop()
                        return ''
                    self.fail('unexpected SQL boundary query')

                def ssh(verb, denied=None):
                    observed = observed_history(rows)
                    with self.assertRaises(Denied) as caught:
                        evidence.database(observed, self.manifest['migrations'])
                    reason = str(caught.exception)
                    self.assertEqual(reason, expected)
                    self.assertEqual(bool(observed['failed_migrations']), expected == 'database-evidence')
                    driver.need(denied == reason, 'controller-denial-not-observed')
                    return {'denied': reason}

                with patch.object(instance, 'snapshot', return_value={'owned': 'unchanged'}), \
                     patch.object(instance, 'receive'), patch.object(instance, 'sql', side_effect=sql), \
                     patch.object(instance, 'ssh', side_effect=ssh), patch.object(instance, 'image_absent'):
                    result = instance.refusal(operation)
                self.assertEqual(result['reason'], expected)
                self.assertTrue(result['containers_unchanged'])
                self.assertEqual(rows, [base])


@unittest.skipUnless(os.geteuid() == 0, 'trusted native temporary files require root-owned ancestors')
class NativeHashContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sm-e2e-native-hash-', dir='/run')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def test_initialize_include_is_public_empty_and_github_stays_private_under_umask(self):
        include, github_dir = self.root / 'include', self.root / 'github'
        paths = {'INCLUDE_DIR': str(include), 'GH_DIR': str(github_dir),
                 'SERVICE': str(self.root / 'service'), 'PASS': str(self.root / 'pass'),
                 'CONFIG': str(self.root / 'config')}
        core = {'backup_identity': {'config_path': str(self.root / 'backup.conf')}}
        for name, value in paths.items():
            context = patch.object(native, name, value)
            context.start()
            self.addCleanup(context.stop)
        with patch.object(native, 'private_file_digest', return_value='sha256:' + 'a' * 64), \
             patch.object(native, 'test_shape'), \
             patch.object(native, 'TestConfiguration'), patch.object(native, 'Runner'), \
             patch.object(native.operator_database, 'identity',
                          return_value={'system_identifier': '1234567'}), \
             patch.object(native.operator_backup, 'repository_identity'):
            previous_umask = os.umask(0o077)
            try:
                native.initialize(core)
            finally:
                os.umask(previous_umask)
        self.assertEqual(include.stat().st_uid, 0)
        self.assertEqual(github_dir.stat().st_uid, 0)
        self.assertEqual(stat.S_IMODE(include.stat().st_mode), 0o755)
        self.assertEqual(stat.S_IMODE(github_dir.stat().st_mode), 0o700)
        self.assertEqual(list(include.iterdir()), [])
        self.assertEqual(list(github_dir.iterdir()), [])
        from operator_config import empty_directory
        empty_directory(include)
        empty_directory(github_dir)

    def native_file(self, size=17 * 1024**2 + 7):
        path = self.root / 'native'
        checksum = hashlib.sha256()
        block = bytes(range(256)) * 256
        with path.open('xb') as stream:
            remaining = size
            while remaining:
                chunk = block[:min(remaining, len(block))]
                stream.write(chunk)
                checksum.update(chunk)
                remaining -= len(chunk)
        path.chmod(0o755)
        return path, 'sha256:' + checksum.hexdigest()

    def configuration(self):
        config = object.__new__(native.TestConfiguration)
        config.inputs, config.metadata, config.native_inputs = {}, {}, {}
        return config

    def test_large_native_hash_and_pin_work_while_both_private_caps_stay_16_mib(self):
        path, expected = self.native_file()
        self.assertEqual(native.native_file_digest(path), expected)
        config = self.configuration()
        self.assertEqual(config.pin_native(str(path), native.NATIVE_FILE_LIMIT), expected)
        config.recheck_inputs()
        with self.assertRaisesRegex(operator.Refused, '^private-file-size$'):
            operator.private(path)
        with self.assertRaisesRegex(Denied, '^trusted-input-size$'):
            private_file_digest(path)

    def test_changed_native_hash_cannot_replace_or_recheck_a_pin(self):
        path, expected = self.native_file()
        config = self.configuration()
        config.pin_native(str(path), native.NATIVE_FILE_LIMIT)
        with path.open('r+b') as stream:
            stream.write(b'changed')
        self.assertNotEqual(native.native_file_digest(path), expected)
        with self.assertRaisesRegex(Denied, '^operator-input-changed$'):
            config.pin_native(str(path), native.NATIVE_FILE_LIMIT)
        with self.assertRaisesRegex(Denied, '^operator-input-changed$'):
            config.recheck_inputs()

    def test_file_and_ancestor_symlinks_are_rejected(self):
        path, _ = self.native_file(65537)
        link = self.root / 'alias'
        link.symlink_to(path)
        with self.assertRaisesRegex(Denied, '^test-native-path$'):
            native.native_file_digest(link)
        ancestor = self.root / 'ancestor'
        ancestor.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(Denied, '^test-native-path$'):
            native.native_file_digest(ancestor / path.name)

    def test_native_file_over_64_mib_is_rejected(self):
        path = self.root / 'oversize'
        with path.open('xb') as stream:
            stream.truncate(native.NATIVE_FILE_LIMIT + 1)
        path.chmod(0o755)
        with self.assertRaisesRegex(Denied, '^test-native-size$'):
            native.native_file_digest(path)

    def test_writable_native_file_and_ancestor_are_rejected(self):
        path, _ = self.native_file(65537)
        path.chmod(0o666)
        with self.assertRaisesRegex(Denied, '^test-native-installation$'):
            native.native_file_digest(path)
        path.chmod(0o755)
        parent = self.root / 'writable'
        parent.mkdir(mode=0o777)
        parent.chmod(0o777)
        path.rename(parent / path.name)
        with self.assertRaisesRegex(Denied, '^test-native-installation$'):
            native.native_file_digest(parent / path.name)

    def test_real_file_growth_between_eof_and_post_stat_is_rejected(self):
        path, _ = self.native_file(65537)
        original = native.os.fstat
        calls = 0

        def growing(fd):
            nonlocal calls
            calls += 1
            if calls == 2:
                with path.open('ab') as stream:
                    stream.write(b'x')
            return original(fd)

        with patch.object(native.os, 'fstat', side_effect=growing):
            with self.assertRaisesRegex(Denied, '^test-native-changed$'):
                native.native_file_digest(path)


@unittest.skipUnless(os.getuid() == 0 and os.geteuid() == 0,
                     'fault contracts require root-owned temporary state')
class NetworkFaultContracts(unittest.TestCase):
    """Bounded filesystem/boundary contracts, not native Docker/HTTP E2E proof."""

    def setUp(self):
        from types import SimpleNamespace
        self.temp = tempfile.TemporaryDirectory(prefix='sm-e2e-fault-', dir='/run')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.state = self.root / 'state'
        self.state.mkdir(mode=0o700)
        self.state.chmod(0o700)
        for family in ('imports', 'admissions', 'transactions'):
            (self.state / family).mkdir(mode=0o700)
        self.config = {'state': str(self.state), 'project_directory': str(self.root),
                       'project': 'sm-rc-e2e-' + '1' * 16}
        self.release = {'sha': 'a' * 40, 'ci_run_id': '7',
                        'archive_sha256': 'sha256:' + 'b' * 64,
                        'image_id': 'sha256:' + 'c' * 64}
        self.key = self.release['sha'] + '-7'
        self.previous = 'sha256:' + 'd' * 64
        self.admission = {**self.release, 'previous_image_id': self.previous}
        self.authority = driver.authority(self.release, 'e' * 40)
        self.write(self.state / 'imports' / (self.key + '.json'), self.release)
        self.write(self.state / 'admissions' / (self.key + '.json'), self.admission)
        self.write(self.root / 'authority.json', self.authority)
        self.addCleanup(patch.stopall)
        patch.object(operator, 'ROOT', self.root).start()
        patch.object(operator, 'FAULT_STATE', self.state).start()
        self.bridge = SimpleNamespace(
            decode=native.decode, exact=native.exact,
            operator_probe=SimpleNamespace(INSPECT=native.operator_probe.INSPECT,
                                          inspect=self.native_inspect))
        patch.object(operator, 'native', return_value=self.bridge).start()
        self.controller = SimpleNamespace(invariant=lambda admission: (
            None, {'image': admission['previous_image_id']}))
        self.row = self.api('1' * 64, self.previous)
        self.events = []
        self.fail_disconnect = False
        patch.object(operator, 'run', side_effect=self.command).start()

    def write(self, path, value):
        from contract import atomic
        atomic(path, value)

    def api(self, identifier, image):
        return {'id': identifier, 'image': image, 'started': '2026-10-03T00:00:00Z',
                'running': True, 'project': self.config['project'], 'service': 'api'}

    def command(self, argv, **kwargs):
        self.events.append(tuple(argv))
        if argv[:3] == ['/usr/bin/docker', 'ps', '-q']:
            self.assertEqual(argv, [
                '/usr/bin/docker', 'ps', '-q', '--no-trunc', '--filter',
                'label=com.docker.compose.project=' + self.config['project'], '--filter',
                'label=com.docker.compose.service=api'])
            return (self.row['id'] + '\n').encode()
        if argv[:3] == ['/usr/bin/docker', 'inspect', '--format']:
            self.assertEqual(argv, ['/usr/bin/docker', 'inspect', '--format',
                                    native.operator_probe.INSPECT, self.row['id']])
            return operator.canonical(self.row)
        self.assertEqual(argv, ['/usr/bin/docker', 'network', 'disconnect',
                                self.config['project'] + '_default', self.row['id']])
        if self.fail_disconnect:
            raise operator.Refused('observation-command-failed')
        return b''

    def native_inspect(self, runner, identifier):
        self.events.append(('native-identification', identifier))
        self.assertEqual(identifier, self.row['id'])
        return {**self.row, 'project': 'platform-social-monitor'}

    def arm(self, rollback=False):
        return operator.arm_network_fault(
            'arm-rollback-network-fault' if rollback else 'arm-network-fault',
            self.key, self.config, self.controller)

    def transaction(self):
        self.write(self.state / 'transactions' / (self.key + '.json'),
                   {'admission': self.admission})

    def probe(self):
        request = {'container_id': self.row['id'], 'image_id': self.row['image'],
                   'sha': self.release['sha'] if self.row['image'] == self.release['image_id']
                   else self.authority['production_revision']}
        operator.probe_network_fault(request, self.config, self.bridge, object())

    def plan(self):
        return operator.fault_plan(self.config, self.key)[1]

    def disconnects(self):
        return [event for event in self.events
                if event[:3] == ('/usr/bin/docker', 'network', 'disconnect')]

    def test_arming_uses_real_protected_files_and_preserves_baseline_probe(self):
        self.arm(True)
        for name in ('network-fault.json', 'network-fault-arm.json'):
            path = self.state / name
            self.assertEqual(path.stat().st_uid, 0)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.probe()
        self.assertEqual(self.disconnects(), [])
        self.assertEqual(self.plan()['disconnected'], [])
        with self.assertRaisesRegex(operator.Refused, '^network-fault-already-armed$'):
            self.arm(True)

    def test_candidate_then_recreated_previous_once_and_repair_is_not_disconnected(self):
        self.arm(True)
        self.transaction()
        self.row = self.api('2' * 64, self.release['image_id'])
        self.events.clear()
        self.probe()
        first_disconnect = self.disconnects()[0]
        self.assertLess(self.events.index(('native-identification', self.row['id'])),
                        self.events.index(first_disconnect))
        self.probe()
        self.row = self.api('3' * 64, self.previous)
        self.probe()
        self.probe()
        plan = self.plan()
        self.assertEqual(plan['candidate_id'], '2' * 64)
        self.assertEqual(plan['previous_id'], '3' * 64)
        self.assertEqual(plan['disconnected'], ['2' * 64, '3' * 64])
        self.assertEqual(len(self.disconnects()), 2)
        self.write(self.state / 'transactions' / (self.key + '.json'),
                   {'admission': self.admission, 'outcome': 'rolled-back'})
        self.probe()
        self.assertEqual(len(self.disconnects()), 2)

    def test_candidate_only_plan_allows_genuine_rollback_probe(self):
        self.arm()
        self.transaction()
        self.row = self.api('2' * 64, self.release['image_id'])
        self.probe()
        self.row = self.api('3' * 64, self.previous)
        self.probe()
        self.assertEqual(len(self.disconnects()), 1)
        self.assertIsNone(self.plan()['previous_id'])
        completed_plan = self.plan()
        tx_path = self.state / 'transactions' / (self.key + '.json')
        terminal = {'admission': self.admission, 'outcome': 'rolled-back'}
        self.write(tx_path, terminal)
        self.probe()
        self.probe()
        self.assertEqual(self.plan(), completed_plan)
        self.assertEqual(len(self.disconnects()), 1)

        for outcome in ('activated', 'failed-rollback', None, True, {}, []):
            with self.subTest(outcome=outcome):
                self.write(tx_path, {**terminal, 'outcome': outcome})
                with self.assertRaisesRegex(operator.Refused, '^network-fault-terminal-state$'):
                    self.probe()
        self.write(tx_path, {**terminal, 'admission': {**self.admission, 'extra': True}})
        with self.assertRaisesRegex(operator.Refused, '^network-fault-transaction-binding$'):
            self.probe()
        self.write(tx_path, [])
        with self.assertRaisesRegex(operator.Refused, '^network-fault-object$'):
            self.probe()
        self.write(tx_path, terminal)

        previous_row = copy.deepcopy(self.row)
        for change, reason in (
                ({'id': '1' * 64}, 'network-fault-live-transaction'),
                ({'id': '4' * 64, 'image': self.release['image_id']},
                 'network-fault-container-changed'),
                ({'image': 'sha256:' + 'f' * 64}, 'network-fault-probe-binding'),
                ({'id': '4' * 64, 'project': 'foreign'}, 'network-fault-api-ownership'),
                ({'id': '4' * 64, 'service': 'postgres'}, 'network-fault-api-ownership')):
            with self.subTest(change=change):
                self.row = {**previous_row, **change}
                with self.assertRaisesRegex(operator.Refused, '^' + reason + '$'):
                    self.probe()
        self.row = previous_row
        request = {'container_id': self.row['id'], 'image_id': self.previous,
                   'sha': self.release['sha']}
        with self.assertRaisesRegex(operator.Refused, '^network-fault-probe-binding$'):
            operator.probe_network_fault(request, self.config, self.bridge, object())
        self.probe()
        self.assertEqual(self.plan(), completed_plan)
        self.assertEqual(len(self.disconnects()), 1)

    def test_failed_disconnect_does_not_publish_completed_marker(self):
        self.arm(True)
        self.transaction()
        self.row = self.api('2' * 64, self.release['image_id'])
        self.fail_disconnect = True
        with self.assertRaisesRegex(operator.Refused, '^observation-command-failed$'):
            self.probe()
        self.assertEqual(self.plan()['disconnected'], [])
        self.assertIsNone(self.plan()['candidate_id'])

    def test_foreign_labels_and_changed_baseline_are_refused_before_disconnect(self):
        self.arm(True)
        for field, value in (('project', 'foreign'), ('service', 'postgres'),
                             ('running', False), ('id', '4' * 64)):
            with self.subTest(field=field):
                self.row = self.api('1' * 64, self.previous)
                self.row[field] = value
                with self.assertRaises(operator.Refused):
                    self.probe()
        self.assertEqual(self.disconnects(), [])

    def test_plan_grammar_order_permissions_and_binding_fail_closed(self):
        self.arm(True)
        path = self.state / 'network-fault.json'
        original = operator.read_json(path)
        changes = (
            {'extra': True}, {'mode': 'arbitrary'},
            {'version': True}, {'key': 'foreign'},
            {'candidate_image': self.previous}, {'baseline_id': 'short'},
            {'previous_id': '3' * 64, 'disconnected': ['3' * 64]},
            {'candidate_id': '2' * 64, 'disconnected': []},
        )
        for change in changes:
            with self.subTest(change=change):
                self.write(path, {**original, **change})
                with self.assertRaises(operator.Refused):
                    self.plan()
        self.write(path, original)
        path.chmod(0o644)
        with self.assertRaisesRegex(operator.Refused, '^network-fault-plan-mode$'):
            self.plan()
        path.chmod(0o600)
        self.write(self.state / 'imports' / (self.key + '.json'),
                   {**self.release, 'archive_bytes': 1})
        with self.assertRaisesRegex(operator.Refused, '^network-fault-plan-binding$'):
            self.plan()
        self.assertEqual(self.disconnects(), [])

    def test_transaction_and_recreated_target_changes_are_refused(self):
        self.transaction()
        with self.assertRaisesRegex(operator.Refused, '^network-fault-before-transaction$'):
            self.arm(True)
        (self.state / 'transactions' / (self.key + '.json')).unlink()
        self.arm(True)
        self.row = self.api('2' * 64, self.release['image_id'])
        with self.assertRaisesRegex(operator.Refused, '^network-fault-live-transaction$'):
            self.probe()
        self.transaction()
        self.probe()
        self.row = self.api('4' * 64, self.release['image_id'])
        with self.assertRaisesRegex(operator.Refused, '^network-fault-container-changed$'):
            self.probe()
        self.assertEqual(len(self.disconnects()), 1)

    def test_changed_authority_admission_or_transaction_is_refused(self):
        self.arm(True)
        paths = (
            (self.root / 'authority.json', self.authority, {'configured': False}),
            (self.state / 'admissions' / (self.key + '.json'), self.admission,
             {'previous_image_id': 'sha256:' + 'f' * 64}),
        )
        for path, original, change in paths:
            with self.subTest(path=path):
                self.write(path, {**original, **change})
                with self.assertRaises(Exception):
                    self.plan()
                self.write(path, original)
        self.write(self.state / 'transactions' / (self.key + '.json'),
                   {'admission': {**self.admission, 'extra': True}})
        with self.assertRaisesRegex(operator.Refused, '^network-fault-transaction-binding$'):
            self.plan()
        self.assertEqual(self.disconnects(), [])


if __name__ == '__main__':
    unittest.main()
