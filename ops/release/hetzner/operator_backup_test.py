"""Independent native-format constants and observed info/repo-get joins."""
import copy
from pathlib import Path
import unittest
from unittest.mock import patch
from contract import Denied, canonical, digest
from test_support import history_context
import evidence
import operator_backup as backup
from operator_config import sha_bytes, SYSTEM_ID, ini
from operator_adapter_test import BINDING, CONTAINER, FixtureConfig, FixtureRunner, temporary
from operator_adapter import dispatch
from operator_config import decode
import operator_github as github

# Independent reference byte stream expanded from official info.c macros, SHA1
# c63c... computed once separately; never calculate an expected checksum using manifest().
NATIVE = b'''[backrest]
backrest-format=5
backrest-version="2.59.1"

[backup]
backup-label="20261002-052243F"
backup-timestamp-start=1790911363
backup-timestamp-stop=1790911374
backup-type="full"

[backup:db]
db-id=1
db-system-id=7688442011877063482
db-version="18"

[target:file]
pg_data/example={"size":3}

[backrest]
backrest-checksum="c63c26669942d9cbe7d8c2273d96ca823ef67926"
'''
NOW = 1790911380
# Derived independently for {"type":"posix","path":"/fixture/repo"}, sorted JSON.
REPO_CONFIG = b'[global]\nrepo1-type=posix\nrepo1-path=/fixture/repo\n[production-main]\npg1-path=/fixture/pg\n'
# Synthetic nonsecret options with the same native SFTP shape as the operator config.
# Key-file paths are inert strings: no key material is read or supplied.
SFTP_CONFIG = b'''[global]
repo1-type=sftp
repo1-path=/fixture/repo
repo1-sftp-host=backup.example.invalid
repo1-sftp-host-user=fixture-backup
repo1-sftp-host-port=2222
repo1-sftp-private-key-file=/fixture/keys/id
repo1-sftp-public-key-file=/fixture/keys/id.pub
repo1-sftp-host-key-check-type=fingerprint
repo1-sftp-host-key-hash-type=sha256
repo1-sftp-host-fingerprint=fixture-only-fingerprint
repo1-cipher-type=aes-256-cbc
repo1-retention-full=2
repo1-retention-diff=7
[production-main]
pg1-path=/fixture/pg
'''
# Independent hashes of literal sorted JSON, with port represented as an INI string.
SFTP_ID = 'repo-sha256-a79ff67e3a6b8c85ef2e20f132d31540cf6d48631fb6699266571283849ac6ab'
POSIX_ID = 'repo-sha256-e8a6326bc53f87e6bfd762d918511652b21050d16b71012809db84533c4e556b'
S3_ID = 'repo-sha256-afaed2024947515074e077b9cbc8e5257c569443b9fb82513db3110aecd9c7d2'
# TEST synthetic data only: native capture, no real customer or production capture.
RAW_NATIVE_INFO = (Path(__file__).parent / 'fixtures' / 'pgbackrest-2.59.1-test-info.json').read_bytes()
NATIVE_INFO_NOW = 1791072350


def info():
    return [{'name': 'production-main', 'status': {'code': 0, 'message': 'ok'},
             'cipher': 'none', 'repo': [{'key': 1, 'status': {'code': 0, 'message': 'ok'}}],
             'archive': [],
             'db': [{'id': 1, 'repo-key': 1, 'system-id': int(SYSTEM_ID), 'version': '18'}],
             'backup': [{'label': '20261002-052243F', 'type': 'full', 'error': False,
                         'timestamp': {'start': 1790911363, 'stop': 1790911374},
                         'database': {'id': 1, 'repo-key': 1},
                         'backrest': {'format': 5, 'version': '2.59.1'}}]}]


def identity_row():
    return {'server_major': 18, 'system_identifier': SYSTEM_ID, 'database': 'fixture_db',
            'role': 'fixture_observer', 'port': '5432', 'transaction_read_only': True,
            'read_only_role': True, 'migrations': None, 'history_complete': None, 'history_context': None}


class RepositoryIdentityTests(unittest.TestCase):
    def observe(self, raw, repository_id=SFTP_ID, config_hash=None):
        config = FixtureConfig()
        config.core['backup_identity']['repository_id'] = repository_id
        config.data['backup_config_sha256'] = config_hash or sha_bytes(raw)
        # Only the existing private-file boundary is replaced; INI parsing,
        # validation, canonical hashing and binding all execute normally.
        with patch.object(backup, 'private_bytes', return_value=raw) as read:
            result = backup.repository_identity(config)
        read.assert_called_once_with(config.core['backup_identity']['config_path'])
        return result

    # Red: SFTP remains unsupported, port becomes an integer, or key/policy
    # options enter the stable endpoint identity instead of just the config hash.
    def test_native_sftp_shape_binds_independent_id_and_exact_config_hash(self):
        self.assertEqual(self.observe(SFTP_CONFIG), (SFTP_ID, sha_bytes(SFTP_CONFIG)))
        changed = SFTP_CONFIG.replace(b'retention-full=2', b'retention-full=3')
        self.assertEqual(self.observe(changed), (SFTP_ID, sha_bytes(changed)))
        with self.assertRaisesRegex(Denied, 'operator-backup-config-changed'):
            self.observe(changed, config_hash=sha_bytes(SFTP_CONFIG))

    # Red: omitting any endpoint field from the hash silently accepts a different repo.
    def test_sftp_host_user_path_and_port_mismatches_deny(self):
        for before, after in ((b'backup.example.invalid', b'other.example.invalid'),
                              (b'fixture-backup', b'other-user'),
                              (b'/fixture/repo', b'/fixture/other'),
                              (b'port=2222', b'port=2223')):
            with self.subTest(field=before):
                with self.assertRaisesRegex(Denied, 'operator-repository-identity'):
                    self.observe(SFTP_CONFIG.replace(before, after))

    # Red: defaulting a missing port, unchecked int coercion, or accepting out-of-range ports.
    def test_sftp_port_requires_bounded_explicit_decimal(self):
        for port in (b'', b'0', b'65536', b'-1', b'+22', b'022', b'22.0', b'1e3',
                     b'NaN', b'Infinity', b'true', b'\xd9\xa2\xd9\xa2', b'9' * 4097, None):
            with self.subTest(port=port[:20] if port else port):
                raw = (SFTP_CONFIG.replace(b'repo1-sftp-host-port=2222\n', b'') if port is None
                       else SFTP_CONFIG.replace(b'port=2222', b'port=' + port))
                with self.assertRaises(Denied):
                    self.observe(raw)
        # Independent literal-JSON hashes prove both inclusive range endpoints bind.
        for port, repo_id in (
                (b'1', 'repo-sha256-e23a1391dcdcdab9af52dc52627e8759594a1e6095697690f705111c20eb381c'),
                (b'65535', 'repo-sha256-8f835c1b5173e73e5a9a7ca10a1bbec1eeaee393fc0f8e6ccf254d7f5b749b49')):
            raw = SFTP_CONFIG.replace(b'port=2222', b'port=' + port)
            self.assertEqual(self.observe(raw, repo_id), (repo_id, sha_bytes(raw)))

    # Red: SFTP bypasses the existing finite field and canonical absolute path guards.
    def test_sftp_fields_and_paths_keep_existing_guards(self):
        for field, value in ((b'path', b'relative'), (b'path', b'/fixture/../repo'),
                             (b'path', b'/fixture//repo'), (b'path', b'/fixture/repo/'),
                             (b'sftp-host', b''), (b'sftp-host-user', b''),
                             (b'sftp-host', b'x' * 4097), (b'sftp-host-user', b'x' * 4097)):
            raw = SFTP_CONFIG.replace(b'repo1-' + field + b'=' +
                                      ini(SFTP_CONFIG)['global']['repo1-' + field.decode()].encode(),
                                      b'repo1-' + field + b'=' + value)
            with self.subTest(field=field, value=value[:30]):
                with self.assertRaises(Denied): self.observe(raw)
        for field in (b'path', b'sftp-host', b'sftp-host-user'):
            line = b'repo1-' + field + b'=' + ini(SFTP_CONFIG)['global']['repo1-' + field.decode()].encode() + b'\n'
            with self.subTest(missing=field):
                with self.assertRaises(Denied): self.observe(SFTP_CONFIG.replace(line, b''))
            for bad in (b'\0', b'$', b'?', b'#', b'@'):
                raw = SFTP_CONFIG.replace(b'repo1-' + field + b'=', b'repo1-' + field + b'=' + bad)
                with self.subTest(field=field, bad=bad):
                    with self.assertRaises(Denied): self.observe(raw)

    # Red: accepting SFTP relaxes config source restrictions for overrides/includes/repos.
    def test_sftp_config_source_guards_remain_closed(self):
        for raw in (SFTP_CONFIG + b'repo1-path=/other\n',
                    SFTP_CONFIG + b'[global:repo-get]\nrepo1-path=/other\n',
                    SFTP_CONFIG.replace(b'repo1-path=', b'repo2-path='),
                    SFTP_CONFIG.replace(b'[global]\n', b'[global]\ninclude=/fixture/extra\n')):
            with self.assertRaises(Denied): self.observe(raw)

    # Red: altering legacy field sets or canonical encoding changes existing IDs.
    def test_posix_and_s3_ids_remain_byte_for_byte(self):
        s3 = REPO_CONFIG.replace(b'type=posix', b'type=s3').replace(
            b'repo1-path=', b'repo1-s3-endpoint=s3.example.invalid\n'
            b'repo1-s3-bucket=fixture-bucket\nrepo1-s3-region=fixture-region\nrepo1-path=')
        for raw, repo_id in ((REPO_CONFIG, POSIX_ID), (s3, S3_ID)):
            with self.subTest(repo_id=repo_id):
                self.assertEqual(self.observe(raw, repo_id), (repo_id, sha_bytes(raw)))
                with self.assertRaisesRegex(Denied, 'operator-repository-identity'):
                    self.observe(raw, SFTP_ID)
                with self.assertRaises(Denied):
                    self.observe(raw.replace(b'/fixture/repo', b'/fixture/../repo'), repo_id)
        for field in (b's3-endpoint', b's3-bucket', b's3-region'):
            value = ini(s3)['global']['repo1-' + field.decode()].encode()
            with self.subTest(missing=field):
                with self.assertRaises(Denied):
                    self.observe(s3.replace(b'repo1-' + field + b'=' + value + b'\n', b''), S3_ID)
        with self.assertRaisesRegex(Denied, 'operator-repository-type'):
            self.observe(SFTP_CONFIG.replace(b'type=sftp', b'type=azure'))


class NativeInfoTests(unittest.TestCase):
    def setUp(self):
        self.config = FixtureConfig()
        self.config.core['backup_identity']['stanza'] = 'production-main'
        self.config.core['backup_identity']['system_identifier'] = '7692597092821086252'
        self.config.core['backup_max_age_seconds'] = 3600

    def test_raw_native_info_selects_independently_configured_full(self):
        self.assertEqual(len(RAW_NATIVE_INFO), 849)
        self.assertEqual(sha_bytes(RAW_NATIVE_INFO),
                         'sha256:fc0341ecfeac4f5d1fc4e0ba0a0059bf87079a298c33cf74880b6ba313bacd1f')
        result = backup.select_info(RAW_NATIVE_INFO, self.config, NATIVE_INFO_NOW)
        self.assertEqual(result, {
            'backup_id': '20261004-000546F',
            'started_at': 1791072346, 'stop': 1791072349,
            'database_id': 1, 'repo_key': 1,
            'system_identifier': '7692597092821086252'})
        self.assertIs(type(result['system_identifier']), str)

    def test_no_archived_wal_metadata_remains_valid(self):
        value = copy.deepcopy(decode(RAW_NATIVE_INFO))
        value[0]['archive'] = []
        self.assertEqual(backup.select_info(canonical(value), self.config, NATIVE_INFO_NOW)['backup_id'],
                         '20261004-000546F')
        value = copy.deepcopy(decode(RAW_NATIVE_INFO))
        value[0]['archive'][0].update({'min': None, 'max': None})
        self.assertEqual(backup.select_info(canonical(value), self.config, NATIVE_INFO_NOW),
                         backup.select_info(RAW_NATIVE_INFO, self.config, NATIVE_INFO_NOW))

    def test_malformed_foreign_and_duplicate_archive_metadata_deny(self):
        changes = [
            lambda v: v[0].pop('archive'),
            lambda v: v[0].update({'archive': None}),
            lambda v: v[0].update({'archive': {}}),
            lambda v: v[0].update({'archive': [None]}),
            lambda v: v[0].update({'archive': copy.deepcopy(v[0]['archive']) * 1001}),
            lambda v: v[0]['archive'][0].update({'unknown': None}),
            lambda v: v[0]['archive'][0].pop('database'),
            lambda v: v[0]['archive'][0].update({'database': None}),
            lambda v: v[0]['archive'][0]['database'].update({'unknown': 1}),
            lambda v: v[0]['archive'][0]['database'].pop('id'),
            lambda v: v[0]['archive'][0]['database'].update({'id': True}),
            lambda v: v[0]['archive'][0]['database'].update({'id': 0}),
            lambda v: v[0]['archive'][0]['database'].update({'id': -1}),
            lambda v: v[0]['archive'][0]['database'].update({'id': '1'}),
            lambda v: v[0]['archive'][0]['database'].update({'id': 2}),
            lambda v: v[0]['archive'][0]['database'].update({'repo-key': True}),
            lambda v: v[0]['archive'][0]['database'].update({'repo-key': 0}),
            lambda v: v[0]['archive'][0]['database'].update({'repo-key': '1'}),
            lambda v: v[0]['archive'][0]['database'].update({'repo-key': 2}),
            lambda v: v[0]['archive'].append(copy.deepcopy(v[0]['archive'][0])),
            lambda v: v[0]['archive'][0].update({'id': None}),
            lambda v: v[0]['archive'][0].update({'id': '18-2'}),
            lambda v: v[0]['archive'][0].update({'id': '19-1'}),
            lambda v: v[0]['archive'][0].update({'id': '18-' + '1' * 100}),
            lambda v: v[0]['db'][0].update({'version': True}),
            lambda v: v[0]['db'][0].update({'version': None}),
            lambda v: v[0]['db'][0].update({'version': '18' * 100}),
            lambda v: v[0]['archive'][0].update({'min': None}),
            lambda v: v[0]['archive'][0].update({'max': None}),
            lambda v: v[0]['archive'][0].update({'min': 0}),
            lambda v: v[0]['archive'][0].update({'max': False}),
            lambda v: v[0]['archive'][0].update({'min': '00000001000000000000000a'}),
            lambda v: v[0]['archive'][0].update({'max': '00000001000000000000003'}),
            lambda v: v[0]['archive'][0].update({'min': '0' * 25}),
            lambda v: v[0]['archive'][0].update({'min': '000000010000000000000004'}),
            lambda v: v[0]['archive'][0].update({'max': '00000001000000000000000G'}),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                value = copy.deepcopy(decode(RAW_NATIVE_INFO))
                change(value)
                with self.assertRaises(Denied):
                    backup.select_info(canonical(value), self.config, NATIVE_INFO_NOW)


class NativeTests(unittest.TestCase):
    def test_native_constant_preserves_raw_values_and_uint64_string(self):
        result = backup.manifest(NATIVE)
        self.assertEqual(result['backrest_checksum'], 'c63c26669942d9cbe7d8c2273d96ca823ef67926')
        self.assertEqual(result['system_identifier'], SYSTEM_ID)
        self.assertIs(type(result['system_identifier']), str)
        self.assertEqual(result['bytes'], len(NATIVE))
        self.assertEqual(result['sha256'], sha_bytes(NATIVE))
        for changed in (NATIVE.replace(b'{"size":3}', b'{"size": 3}'),
                        NATIVE.replace(b'db-id=1', b'db-id=2'),
                        NATIVE.replace(b'backrest-checksum=', b'unknown-checksum='),
                        NATIVE + b'\n[backup:db]\ndb-id=1\n',
                        NATIVE.replace(b'[target:file]', b'[unknown]')):
            with self.assertRaises(Denied): backup.manifest(changed)

    def test_checksum_is_ordered_native_stream_not_reserialized_metadata(self):
        reordered = NATIVE.replace(b'db-id=1\ndb-system-id=' + SYSTEM_ID.encode(),
                                   b'db-system-id=' + SYSTEM_ID.encode() + b'\ndb-id=1')
        with self.assertRaises(Denied): backup.manifest(reordered)
        # The checksum itself is skipped, wherever the checksum-only section occurs.
        checksum = b'[backrest]\nbackrest-checksum="c63c26669942d9cbe7d8c2273d96ca823ef67926"\n'
        before = NATIVE[:NATIVE.rindex(b'[backrest]')]
        self.assertTrue(backup.manifest(checksum + before)['checksum_verified'])
        with self.assertRaises(Denied): backup.manifest(before)

    def test_unknown_configuration_include_and_repo_id_fail_closed(self):
        config = FixtureConfig()
        config.data['backup_config_sha256'] = sha_bytes(REPO_CONFIG)
        with patch.object(backup, 'private_bytes', return_value=REPO_CONFIG):
            with self.assertRaises(Denied): backup.repository_identity(config)
        for raw in (b'[global]\ninclude=/fixture/file\n', b'[global]\nx=1\nx=2\n',
                    b'[global]\nx=${AMBIENT}\n'):
            with self.assertRaises(Denied): ini(raw)
        # A second repo or command-specific section cannot quietly alter the selected repo.
        config.core['backup_identity']['repository_id'] = 'repo-sha256-' + __import__('hashlib').sha256(
            canonical({'type': 'posix', 'path': '/fixture/repo'})).hexdigest()
        for raw in (REPO_CONFIG + b'[global:repo-get]\nrepo1-path=/other\n',
                    REPO_CONFIG.replace(b'repo1-path=', b'repo2-path=')):
            config.data['backup_config_sha256'] = sha_bytes(raw)
            with patch.object(backup, 'private_bytes', return_value=raw):
                with self.assertRaises(Denied): backup.repository_identity(config)


class BackupJoinTests(unittest.TestCase):
    # Red: SFTP identity fails the real backup/manifest joins or the core evidence
    # binding, or the second config read allows changed reviewed options.
    def test_sftp_identity_joins_native_backup_and_core_evidence(self):
        config = FixtureConfig()
        config.data['backup_config_sha256'] = sha_bytes(SFTP_CONFIG)
        config.core['backup_identity']['repository_id'] = SFTP_ID
        def provider(argv, data, env):
            if argv[0].endswith('/psql'): return identity_row()
            self.assertIn('--config-include-path=/etc/social-monitor/release/pgbackrest-empty', argv)
            return info() if argv[-1] == 'info' else NATIVE
        runner = FixtureRunner(provider)
        with patch.object(backup, 'private_bytes', return_value=SFTP_CONFIG) as read:
            value = backup.backup(config, runner, BINDING, NOW)
        self.assertEqual(read.call_count, 2)
        self.assertEqual(len(runner.calls), 4)
        live = {'method': 'pg_control_system', 'server_major': 18,
                'system_identifier': SYSTEM_ID, 'observed_at': NOW}
        with patch('contract.time.time', return_value=NOW):
            receipt = evidence.backup(value, BINDING, config.core, live=live,
                                      config_hash=sha_bytes(SFTP_CONFIG))
        self.assertEqual(receipt['repository_id'], SFTP_ID)
        self.assertEqual(receipt['config_sha256'], sha_bytes(SFTP_CONFIG))
        self.assertEqual(receipt['manifest']['sha256'], sha_bytes(NATIVE))
        changed = SFTP_CONFIG.replace(b'retention-full=2', b'retention-full=3')
        with patch.object(backup, 'private_bytes', side_effect=[SFTP_CONFIG, changed]):
            with self.assertRaisesRegex(Denied, 'operator-backup-config-changed'):
                backup.backup(config, FixtureRunner(provider), BINDING, NOW)

    def test_exact_native_observations_consumed_by_core(self):
        config = FixtureConfig()
        config.data['backup_config_sha256'] = sha_bytes(REPO_CONFIG)
        config.core['backup_identity']['repository_id'] = 'repo-sha256-' + __import__('hashlib').sha256(
            canonical({'type': 'posix', 'path': '/fixture/repo'})).hexdigest()
        def provider(argv, data, env):
            if argv[0].endswith('/psql'):
                self.assertEqual(env['PGSERVICEFILE'], '/etc/social-monitor/release/observer.pg_service.conf')
                self.assertNotIn('PGPASSWORD', env)
                return identity_row()
            self.assertEqual(argv[0], config.core['backup_identity']['wrapper'])
            self.assertIn('--config=/etc/pgbackrest/production-main.conf', argv)
            self.assertIn('--repo=1', argv)
            if argv[-1] == 'info': return info()
            self.assertEqual(argv[-2:], ['repo-get', 'backup/production-main/20261002-052243F/backup.manifest'])
            return NATIVE
        runner = FixtureRunner(provider)
        with patch.object(backup, 'private_bytes', return_value=REPO_CONFIG):
            value = backup.backup(config, runner, BINDING, NOW)
        self.assertEqual(value['receipt_digest'], digest(BINDING))
        self.assertEqual(value['manifest']['sha256'], value['repo_get']['sha256'])
        self.assertEqual(value['manifest']['bytes'], len(NATIVE))
        self.assertEqual(len(runner.calls), 4)
        live = {'method': 'pg_control_system', 'server_major': 18,
                'system_identifier': SYSTEM_ID, 'observed_at': NOW}
        with patch('contract.time.time', return_value=NOW):
            receipt = evidence.backup(value, BINDING, config.core, live=live,
                                      config_hash=sha_bytes(REPO_CONFIG))
        self.assertEqual(receipt['manifest']['backrest_checksum'], 'c63c26669942d9cbe7d8c2273d96ca823ef67926')
        self.assertNotIn('cipher', receipt)
        self.assertNotIn('pg_data/example', str(receipt))
        self.assertNotIn(REPO_CONFIG.decode(), str(receipt))

    def test_preflight_observes_all_backing_contracts_and_never_defaults_success(self):
        config = FixtureConfig()
        config.data['backup_config_sha256'] = sha_bytes(REPO_CONFIG)
        config.core['backup_identity']['repository_id'] = 'repo-sha256-e8a6326bc53f87e6bfd762d918511652b21050d16b71012809db84533c4e556b'
        bad = [False]
        def provider(argv, data, env):
            if argv[0].endswith('/gh'):
                return {'path': '.github/workflows/production-deploy.yml',
                        'state': 'active' if bad[0] else 'disabled_manually'}
            if argv[0].endswith('/psql'):
                value = identity_row()
                if b'public._prisma_migrations' in data:
                    value.update({'migrations': [], 'history_complete': True,
                        'history_context': history_context([], value['system_identifier'],
                            value['database'], value['role'], value['port'])})
                return value
            if argv[0].endswith('/docker'):
                if argv[1] == 'exec':
                    return {'http_status': 200, 'body': {'status': 'ok', 'service': 'api-gateway',
                        'checks': [{'name': 'postgres_runtime_pool', 'status': 'ok',
                            'detail': 'A query completed through the bounded shared Prisma pool.'}]}}
                return {'id': CONTAINER, 'image': BINDING['image_id'], 'started': '2026-10-02T00:00:00Z',
                        'running': True, 'project': 'platform-social-monitor', 'service': 'api'}
            return info() if argv[-1] == 'info' else NATIVE
        with temporary() as directory:
            token = Path(directory) / 'token'
            token.write_bytes(b'fixture_only_token_not_authority'); token.chmod(0o600)
            with patch.object(github, 'TOKEN', str(token)), \
                 patch.object(backup, 'private_bytes', return_value=REPO_CONFIG), \
                 patch('operator_adapter.time.time', return_value=NOW):
                runner = FixtureRunner(provider)
                result = decode(dispatch('preflight', {}, config, runner))
                self.assertTrue(result['configured'])
                self.assertEqual(result['legacy_workflow'], 'disabled_manually')
                self.assertEqual(len(runner.calls), 10)
                bad[0] = True
                with self.assertRaises(Denied): dispatch('preflight', {}, config, FixtureRunner(provider))

    def test_wrong_cluster_repo_db_pending_error_and_stale_full_deny(self):
        config = FixtureConfig()
        changes = [lambda v: v[0]['db'][0].update({'system-id': int(SYSTEM_ID) + 1}),
                   lambda v: v[0]['backup'][0]['database'].update({'id': 2}),
                   lambda v: v[0]['backup'][0]['database'].update({'repo-key': 2}),
                   lambda v: v[0]['backup'][0].update({'error': True}),
                   lambda v: v[0]['backup'][0]['timestamp'].update({'stop': NOW + 1}),
                   lambda v: v[0]['repo'][0]['status'].update({'code': 1}),
                   lambda v: v[0]['db'].append(copy.deepcopy(v[0]['db'][0]))]
        for change in changes:
            value = info(); change(value)
            with self.assertRaises(Denied): backup.select_info(canonical(value), config, NOW)
        with self.assertRaises(Denied):
            backup.select_info(canonical(info()), config, NOW + 86400)

    def test_manifest_info_mismatch_and_mid_observation_replacement_deny(self):
        config = FixtureConfig()
        counter = [0]
        def provider(argv, data, env):
            if argv[0].endswith('/psql'): return identity_row()
            if argv[-1] == 'info':
                counter[0] += 1
                value = info()
                if counter[0] == 2:
                    value[0]['backup'][0]['timestamp']['start'] -= 1
                return value
            return NATIVE
        with patch.object(backup, 'repository_identity', return_value=(config.core['backup_identity']['repository_id'],
                                                                      'sha256:' + '1' * 64)):
            with self.assertRaises(Denied): backup.backup(config, FixtureRunner(provider), BINDING, NOW)
            wrong = info(); wrong[0]['backup'][0]['timestamp']['start'] -= 1
            runner = FixtureRunner(lambda a, d, e: identity_row() if a[0].endswith('/psql') else
                                   wrong if a[-1] == 'info' else NATIVE)
            with self.assertRaises(Denied): backup.backup(config, runner, BINDING, NOW)


if __name__ == '__main__':
    unittest.main()
