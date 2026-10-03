"""Offline repair regressions; no native daemons, installations or production hooks."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
import unittest
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
                'migrations': rows, 'history_complete': True})
    return operator_database.database(Configuration(), Runner())


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
            'id': 'original-row', 'name': migration['name'], 'checksum': migration['checksum'],
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
                        rows.append({'id': identifier, 'name': name, 'checksum': checksum,
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
                    observed = observed_history([{k: v for k, v in row.items() if k != 'id'} for row in rows])
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


if __name__ == '__main__':
    unittest.main()
