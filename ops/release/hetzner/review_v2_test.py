"""Four review-v2 defects: independent identity joins, input bytes and hard budgets."""
import copy
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import bounds
from archive import inspect_archive
from bounds import Budget, gzip_chunks
from contract import Denied, private_file_digest, validate_backup_identity
from evidence import backup
from host import Host
from test_support import HERE, SHA, RUN, PREVIOUS, setup, receive, run, mutate, archive, layered_archive, layer, MIGRATION


class ReviewV2(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.config = setup(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def ok(self, command):
        result = run(self.root, command)
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        return json.loads(result.stdout)

    def denied(self, command, reason):
        result = run(self.root, command)
        self.assertEqual(result.returncode, 1, (result.stdout, result.stderr))
        self.assertEqual(json.loads(result.stdout)['denied'], reason)
        self.assertNotIn('"up"', (self.root / 'commands.jsonl').read_text())

    def admit(self):
        result, _ = receive(self.root)
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        return self.ok(f'admit {SHA} {RUN}')

    def proof(self):
        binding = {'sha': SHA, 'ci_run_id': RUN, 'archive_sha256': 'sha256:' + '1' * 64,
                   'image_id': PREVIOUS}
        def observe(verb, request):
            result = subprocess.run([sys.executable, '-B', str(HERE / 'fake_command.py'),
                str(self.root), '/operator-adapter', verb], input=json.dumps(request).encode(),
                stdout=subprocess.PIPE, check=True)
            return json.loads(result.stdout)
        return binding, observe('backup', binding), observe('postgres-identity', {})

    # Fresh PG18 status is insufficient: root selectors, observed live PG and exact artifact must join.
    def test_unrelated_database_repository_and_manifest_denied(self):
        binding, original, live = self.proof()
        config_hash = original['config_sha256']
        for changes in ({'stanza': 'unrelated-cluster'}, {'repository': '2'},
            {'repository_id': 'unrelated-repo'}, {'repo_key': 2}, {'system_identifier': '2222'},
            {'config_path': '/unrelated.conf'}, {'wrapper': '/unrelated-wrapper'},
            {'config_sha256': 'sha256:' + 'f' * 64}):
            proof = {**original, **changes}
            proof['reference'] = 'pgbackrest:{stanza}:{repository}:{backup_id}'.format(**proof)
            with self.subTest(changes=changes), self.assertRaisesRegex(Denied, 'backup-config-identity'):
                backup(proof, binding, self.config, live=live, config_hash=config_hash)
        for changes in ({'path': 'backup/unrelated/other/backup.manifest'},
            {'label': '20260101-000000F'}, {'system_identifier': '2222'}, {'database_id': 2},
            {'stop': original['stop'] - 1}, {'started_at': 1}, {'server_major': 17},
            {'backup_type': 'diff'}, {'sha256': ''}, {'bytes': 0}, {'checksum_verified': False},
            {'backrest_checksum': ''}, {'raw_payload': 'forbidden'}, {'sha256': 'sha256:' + 'f' * 64},
            {'bytes': original['manifest']['bytes'] + 1}):
            proof = {**original, 'manifest': {**original['manifest'], **changes}}
            with self.subTest(changes=changes), self.assertRaises(Denied):
                backup(proof, binding, self.config, live=live, config_hash=config_hash)
        for changes in ({'repository_id': 'unrelated-repo'}, {'path': 'backup/unrelated/backup.manifest'},
                        {'status_code': 1}, {'sha256': 'sha256:' + 'f' * 64}):
            with self.assertRaisesRegex(Denied, 'backup-repo-get-binding'):
                backup({**original, 'repo_get': {**original['repo_get'], **changes}}, binding,
                       self.config, live=live, config_hash=config_hash)
        for changed_live in (None, {**live, 'system_identifier': '2222'},
                             {**live, 'method': 'caller-claim'}, {**live, 'observed_at': 1}):
            with self.assertRaises(Denied):
                backup(original, binding, self.config, live=changed_live, config_hash=config_hash)
        valid = backup(original, binding, self.config, live=live, config_hash=config_hash)
        self.assertEqual(valid['manifest']['sha256'], original['manifest']['sha256'])
        self.assertEqual(valid['system_identifier'], live['system_identifier'])
        self.assertNotIn('raw_payload', valid)

    # Rejection must reach the state machine before image import/up; live observation has no caller identity.
    def test_backup_identity_rejected_at_admission_and_activation(self):
        self.assertEqual(receive(self.root)[0].returncode, 0)
        mutate(self.root, backup_mutations={'repository_id': 'unrelated-repo'})
        self.denied(f'admit {SHA} {RUN}', 'backup-config-identity')
        mutate(self.root, backup_mutations={})
        self.ok(f'admit {SHA} {RUN}')
        mutate(self.root, live_system_identifier='2222')
        self.denied(f'activate {SHA} {RUN}', 'backup-live-identity')
        self.assertNotIn('"load"', (self.root / 'commands.jsonl').read_text())
        mutate(self.root, live_system_identifier='1111111111111111111')
        receipt = self.ok(f'activate {SHA} {RUN}')
        self.assertEqual(receipt['backup']['manifest']['label'], receipt['backup']['backup_id'])
        self.assertEqual(receipt['backup']['config_sha256'], 'sha256:' + hashlib.sha256(
            Path(self.config['backup_identity']['config_path']).read_bytes()).hexdigest())

    def test_root_identity_schema_and_24_hour_policy(self):
        for identity in ({}, {**self.config['backup_identity'], 'repository': 'unrelated-repo'},
                         {**self.config['backup_identity'], 'config_path': '/config/../other'}):
            with self.assertRaises(Denied):
                validate_backup_identity(identity)
        mutate(self.root, backup_stop=int(time.time()) - 23 * 3600)
        binding, proof, live = self.proof()
        config = {**self.config, 'backup_max_age_seconds': 86400}
        self.assertEqual(backup(proof, binding, config, live=live,
                         config_hash=proof['config_sha256'])['completed_at'], proof['stop'])
        with self.assertRaisesRegex(Denied, 'stale-evidence'):
            backup(proof, binding, self.config, live=live, config_hash=proof['config_sha256'])

    # Actual collector source root is denied while worker words in docs remain admissible.
    def test_actual_collector_root_and_worker_docs(self):
        self.assertEqual(receive(self.root)[0].returncode, 0)
        mutate(self.root, paths=['apps/x-collector/src/main.ts'])
        self.denied(f'admit {SHA} {RUN}', 'sensitive-files')
        mutate(self.root, paths=['docs/x-collector-worker-notes.md'])
        self.ok(f'admit {SHA} {RUN}')

    # Byte changes at an unchanged path were invisible in --no-env-resolution models.
    def test_existing_compose_and_each_environment_input_mutation(self):
        self.admit()
        for path in (*self.config['env_files'], str(self.root / 'service.env'),
                     *self.config['compose_files']):
            item = Path(path)
            original = item.read_bytes()
            item.write_bytes(original + (b'\n# byte drift\n' if path in self.config['compose_files']
                                         else b'SYNTHETIC_API_MODE=two\n'))
            self.denied(f'activate {SHA} {RUN}', 'trusted-compose-changed')
            item.write_bytes(original)
        self.assertEqual(self.ok(f'activate {SHA} {RUN}')['outcome'], 'activated')

    # Immediate up guard catches drift introduced after the initial activation invariant.
    def test_up_rechecks_fingerprint_before_execution(self):
        admission = self.admit()
        model = json.loads((self.root / 'fake.json').read_text())['model']
        class InProcessHost(Host):
            def private_digest(inner, path):
                with patch('contract.trusted', lambda value: Path(value)):
                    return super(InProcessHost, inner).private_digest(path)
            def command(inner, argv, data=None):
                if 'config' in argv:
                    result = copy.deepcopy(model)
                    if len([a for a in argv if a == '-f']) > 1:
                        result['services']['api']['image'] = PREVIOUS
                        (self.root / 'service.env').write_text('SYNTHETIC_API_MODE=changed\n')
                    return json.dumps(result).encode()
                self.fail('up executed after input drift')
        with self.assertRaisesRegex(Denied, 'trusted-compose-changed'):
            InProcessHost(self.config).up(PREVIOUS, self.root / 'override.json', admission['compose_hash'])

    def test_private_inputs_are_bounded_regular_canonical_files(self):
        path = self.root / 'input'
        path.write_bytes(b'synthetic-only')
        with patch('contract.trusted', lambda value: Path(value)):
            self.assertEqual(private_file_digest(path), 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest())
            with path.open('wb') as stream:
                stream.truncate(16 * 1024**2 + 1)
            with self.assertRaisesRegex(Denied, 'trusted-input-size'):
                private_file_digest(path)
            with self.assertRaisesRegex(Denied, 'trusted-path'):
                private_file_digest(str(self.root) + '/./input')
            path.unlink()
            path.symlink_to(self.root / 'service.env')
            with self.assertRaises(OSError):
                private_file_digest(path)

    # Command env disables implicit project .env and never accepts caller Compose environment.
    def test_compose_implicit_env_disabled(self):
        with patch('host.subprocess.run', return_value=subprocess.CompletedProcess([], 0, b'{}')) as call:
            Host(self.config).command(Host(self.config).compose() + ['config'])
        self.assertEqual(call.call_args.kwargs['env']['COMPOSE_DISABLE_ENV_FILE'], '1')
        self.assertNotIn('COMPOSE_FILE', call.call_args.kwargs['env'])

    # Filename/comment/extras/CRC headers are bounded before any decompression.
    def test_gzip_optional_metadata_limits_and_short_deadline(self):
        base = gzip.compress(b'ordinary-gzip', mtime=0)
        for flag in (8, 16):
            data = base[:3] + bytes([flag]) + base[4:10] + b'x' * (8 * 1024**2) + b'\0' + base[10:]
            started = time.monotonic()
            with self.assertRaisesRegex(Denied, 'gzip-metadata-limit'):
                list(gzip_chunks(io.BytesIO(data), Budget()))
            self.assertLess(time.monotonic() - started, 0.3)
            budget = Budget()
            budget.end = time.monotonic() + 0.01
            with self.assertRaisesRegex(Denied, 'archive-deadline'):
                list(gzip_chunks(io.BytesIO(data), budget))
        extra = base[:3] + b'\x04' + base[4:10] + b'\xff\xff' + bytes(65535) + base[10:]
        with self.assertRaisesRegex(Denied, 'gzip-metadata-limit'):
            list(gzip_chunks(io.BytesIO(extra), Budget()))

    # Ordinary Docker gzip, optional headers and concatenated members still verify CRC/trailer/EOF.
    def test_gzip_crc_trailer_and_valid_optional_fields(self):
        import zlib
        base = gzip.compress(b'ordinary-gzip', mtime=0)
        header = base[:3] + b'\x1e' + base[4:10] + b'\x03\x00abcname\0comment\0'
        optional = header + (zlib.crc32(header) & 0xffff).to_bytes(2, 'little') + base[10:]
        self.assertEqual(b''.join(gzip_chunks(io.BytesIO(optional + base), Budget())), b'ordinary-gzip' * 2)
        for data in (base[:-1], base[:-8] + bytes(8), optional[:len(header)] + b'\0\0' + base[10:]):
            with self.assertRaises(Denied):
                list(gzip_chunks(io.BytesIO(data), Budget()))

    # A supervisor bounds the complete call, including a blocking parser/hash inside the validator.
    def test_processing_deadline_supervises_blocking_call(self):
        fixture = archive(self.root)
        original_run = subprocess.run
        def blocked(*args, **kwargs):
            # Real child sleep substitutes a blocked validator; production timeout must kill/reap it.
            return original_run([sys.executable, '-c', 'import time; time.sleep(5)'], **kwargs)
        started = time.monotonic()
        with patch('bounds.PROCESS_SECONDS', 0.05), patch('archive.subprocess.run', blocked):
            with self.assertRaisesRegex(Denied, 'archive-deadline'):
                inspect_archive(fixture[0], fixture[2], fixture[1], SHA, RUN, '/app/prisma/migrations')
        self.assertLess(time.monotonic() - started, 0.5)
        # No timer/global process state survives the timeout; a real archive still succeeds.
        self.assertTrue(inspect_archive(fixture[0], fixture[2], fixture[1], SHA, RUN,
                                       '/app/prisma/migrations')['migrations'])

    # Real 8 MiB optional header through receive: deadline denial releases flock and upload storage.
    def test_long_gzip_header_full_receive_deadline_releases_lock(self):
        def long_header(data):
            return data[:3] + b'\x08' + data[4:10] + b'x' * (8 * 1024**2) + b'\0' + data[10:]
        fixture, _ = layered_archive(self.root, [layer([
            ('app/prisma/migrations/' + MIGRATION + '/migration.sql', b'SELECT 1;')])],
            modern=True, gzip_transform=long_header)
        path, image, checksum = fixture
        command = f'receive {SHA} {RUN} {checksum} {image} {path.stat().st_size}'
        code = ('import bounds,runpy; bounds.PROCESS_SECONDS=0.01; '
                'runpy.run_path("test_support.py",run_name="__main__")')
        started = time.monotonic()
        result = subprocess.run([sys.executable, '-B', '-c', code, str(self.root), command],
            cwd=HERE, input=path.read_bytes(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
        self.assertEqual(result.returncode, 1, (result.stdout, result.stderr))
        self.assertEqual(json.loads(result.stdout)['denied'], 'archive-deadline')
        self.assertLess(time.monotonic() - started, 2)
        self.ok('status')
        self.assertEqual(list((self.root / 'state' / 'inbox').iterdir()), [])
