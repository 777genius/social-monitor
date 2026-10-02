"""Review regression proofs. Each comment names behavior that makes the test red."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from archive import inspect_archive, OCI
from contract import Denied, atomic, read_json
from test_support import (HERE, SHA, RUN, PREVIOUS, MIGRATION, archive, layer,
                          layered_archive, mutate, receive, run, setup)

KEY = SHA + '-' + RUN
SQL = 'app/prisma/migrations/' + MIGRATION + '/migration.sql'


class Corrections(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.config = setup(self.root)
        self.state = self.root / 'state'

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

    def admitted(self):
        result, image = receive(self.root)
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        self.ok(f'admit {SHA} {RUN}')
        return image

    def inspect(self, layers, modern=False, **options):
        fixture, descriptor = layered_archive(self.root, layers, modern, **options)
        return inspect_archive(fixture[0], fixture[2], fixture[1], SHA, RUN, '/app/prisma/migrations'), fixture, descriptor

    def no_execution(self):
        log = self.root / 'commands.jsonl'
        commands = log.read_text() if log.exists() else ''
        self.assertNotIn('"load"', commands)
        self.assertNotIn('"up"', commands)

    # Red if modern ID is equated to config digest, dirs/gzip rejected, or graph omitted from receipt.
    def test_modern_manifest_graph_loaded_and_running(self):
        info, fixture, descriptor = self.inspect([layer([(SQL, b'SELECT 1;')])], modern=True)
        self.assertNotEqual(info['image_graph']['config_digest'], fixture[1])
        self.assertNotEqual(info['image_graph']['layers'][0]['digest'], info['image_graph']['diff_ids'][0])
        mutate(self.root, descriptors={fixture[1]: descriptor})
        self.assertEqual(receive(self.root, fixture)[0].returncode, 0)
        self.ok(f'admit {SHA} {RUN}')
        receipt = self.ok(f'activate {SHA} {RUN}')
        self.assertEqual(receipt['image_graph'], info['image_graph'])
        self.assertEqual(receipt['image_id'], fixture[1])

    # Red if unsupported candidate indexes are guessed through to config or a wrong Docker descriptor passes.
    def test_candidate_index_and_loaded_descriptor_denied(self):
        with self.assertRaisesRegex(Denied, 'candidate-index-unsupported'):
            self.inspect([layer([(SQL, b'SELECT 1;')])], modern=True, root_media=OCI + 'index.v1+json')
        with self.assertRaisesRegex(Denied, 'candidate-attestation-unsupported'):
            self.inspect([layer([(SQL, b'SELECT 1;')])], modern=True,
                         root_annotations={'vnd.docker.reference.type': 'attestation-manifest'})
        _, fixture, descriptor = self.inspect([layer([(SQL, b'SELECT 1;')])], modern=True)
        mutate(self.root, descriptors={fixture[1]: {**descriptor, 'size': descriptor['size'] + 1}})
        self.assertEqual(receive(self.root, fixture)[0].returncode, 0)
        self.ok(f'admit {SHA} {RUN}')
        self.denied(f'activate {SHA} {RUN}', 'loaded-descriptor')
        self.assertNotIn('"up"', (self.root / 'commands.jsonl').read_text())

    # Red if a preexisting Docker index needs a candidate-platform resolver or app revision endpoint.
    def test_baseline_index_and_revisionless_http_ready(self):
        mutate(self.root, descriptors={PREVIOUS: {'digest': PREVIOUS, 'size': 900,
               'mediaType': OCI + 'index.v1+json'}})
        self.admitted()
        self.assertEqual(self.ok(f'activate {SHA} {RUN}')['outcome'], 'activated')

    # Red under the names-only comparison: exact same migration name, changed SQL bytes.
    def test_same_name_changed_sql_denied_before_execution(self):
        fixture, _ = layered_archive(self.root, [layer([(SQL, b'SELECT 2;')])])
        self.assertEqual(receive(self.root, fixture)[0].returncode, 0)
        self.denied(f'admit {SHA} {RUN}', 'migration-required')
        self.no_execution()

    # Red if nested migration aliases, directory-over-file or file-over-directory preserve a phantom SQL file.
    def test_final_migration_filesystem(self):
        for layers in ([layer([(SQL.replace('/migration.sql', '/nested/migration.sql'), b'SELECT 1;')])],
                       [layer([(SQL, b'SELECT 1;')]), layer([(SQL, None)])],
                       [layer([(SQL, b'SELECT 1;')]), layer([(SQL.rsplit('/', 1)[0], b'file')])],
                       [layer([(SQL, b'SELECT 1;')]), layer([('app/prisma', b'file')])]):
            with self.assertRaises(Denied):
                self.inspect(layers)
        # Opaque/whiteout deletion applies only to lower entries; same-layer replacement survives.
        info, _, _ = self.inspect([layer([(SQL, b'old')]), layer([
            (SQL, b'SELECT 1;'), (SQL.rsplit('/', 1)[0] + '/.wh..wh..opq', b'')])])
        self.assertEqual(info['migrations'], [{'name': MIGRATION,
                         'checksum': hashlib.sha256(b'SELECT 1;').hexdigest()}])
        with self.assertRaisesRegex(Denied, 'migration-layout'):
            self.inspect([layer([(SQL, b'SELECT 1;')]), layer([('app/.wh.prisma', b'')])])

    # Red if a checksum-valid but pending or rolled-back row counts as successfully applied.
    def test_database_statuses_denied(self):
        self.assertEqual(receive(self.root)[0].returncode, 0)
        for flags in ({'migration_finished': None}, {'migration_finished': 'done', 'migration_rolled_back': 'done'},
                      {'migration_rolled_back': None, 'sql_checksum': 'f' * 64}):
            mutate(self.root, **flags)
            self.denied(f'admit {SHA} {RUN}', 'migration-required')
        self.no_execution()

    # Red if fresh verification masks an ancient full, or error/status failures and dump lane are accepted.
    def test_backup_actual_stop_and_variant_gate(self):
        self.assertEqual(receive(self.root)[0].returncode, 0)
        for flags, reason in [({'backup_stop': 1}, 'stale-evidence'),
            ({'backup_stop': int(time.time()), 'backup_status': 1}, 'backup-unverified'),
            ({'backup_status': 0, 'backup_error': True}, 'backup-unverified'),
            ({'backup_error': False, 'backup_format': 'pg_dump-Fc'}, 'backup-lane')]:
            mutate(self.root, **flags)
            self.denied(f'admit {SHA} {RUN}', reason)
        self.no_execution()
        mutate(self.root, backup_format='pgbackrest-full')
        self.ok(f'admit {SHA} {RUN}')
        backup = self.ok(f'activate {SHA} {RUN}')['backup']
        self.assertEqual(backup['backup_id'], '20261002-052243F')
        self.assertEqual(backup['completed_at'], backup['stop'])
        self.assertEqual(backup['status_code'], 0)
        self.assertIn('evidence_sha256', backup)

    # Red if crash after receipt publication leaves main eligibility ahead of journal reconciliation.
    def test_published_activation_crash_main_advance_reconciles(self):
        self.admitted()
        mutate(self.root, crash_receipt=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        tx_path = self.state / 'transactions' / (KEY + '.json')
        self.assertNotIn('outcome', read_json(tx_path))
        receipt_path = self.state / 'receipts' / (KEY + '.json')
        original = receipt_path.read_bytes()
        mutate(self.root, main_sha='f' * 40)
        self.assertEqual(self.ok(f'activate {SHA} {RUN}')['outcome'], 'activated')
        self.assertEqual(read_json(tx_path)['outcome'], 'activated')
        self.assertEqual(receipt_path.read_bytes(), original)
        self.assertEqual((self.root / 'commands.jsonl').read_text().count('"up"'), 1)

    # Red if absent tx outcome selects the activation filename for rollback, then conflicts/latches.
    def test_published_activation_crash_explicit_rollback_and_resume(self):
        self.admitted()
        mutate(self.root, crash_receipt=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        original = (self.state / 'receipts' / (KEY + '.json')).read_bytes()
        mutate(self.root, main_sha='f' * 40, crash_receipt=True)
        self.assertEqual(run(self.root, f'rollback {SHA} {RUN}').returncode, -9)
        self.assertEqual(self.ok(f'rollback {SHA} {RUN}')['outcome'], 'rolled-back')
        self.assertEqual(self.ok('receipt ' + KEY + '-rollback')['outcome'], 'rolled-back')
        self.assertEqual((self.state / 'receipts' / (KEY + '.json')).read_bytes(), original)
        self.assertFalse((self.state / 'latch.json').exists())

    # Red if reconstructing a missing journal outcome requires the failed candidate to be ready.
    def test_crashed_published_activation_unhealthy_explicit_rollback(self):
        image = self.admitted()
        mutate(self.root, crash_receipt=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        mutate(self.root, main_sha='f' * 40, unready=[image])
        self.assertEqual(self.ok(f'rollback {SHA} {RUN}')['outcome'], 'rolled-back')
        self.assertFalse((self.state / 'latch.json').exists())

    # Red if adapter's last push/base assertion or incomplete shared review authorizes code execution.
    def test_complete_production_delta_and_shared_review(self):
        self.assertEqual(receive(self.root)[0].returncode, 0)
        for flags, reason in [({'diff_base': 'd' * 40}, 'adapter-binding'),
            ({'diff_base': 'c' * 40, 'complete_delta': False}, 'compatibility-base'),
            ({'complete_delta': True, 'paths': ['libs/platform-persistence/src/summary.ts'],
              'shared_reviewed': False}, 'compatibility-unreviewed')]:
            mutate(self.root, **flags)
            self.denied(f'admit {SHA} {RUN}', reason)
        self.no_execution()
        mutate(self.root, shared_reviewed=True, paths=['libs/platform-persistence/src/summary.ts',
                                                     'docs/worker-operations.md'])
        admission = self.ok(f'admit {SHA} {RUN}')
        self.assertEqual(admission['compatibility']['production_revision'], 'c' * 40)
        self.assertIn('compatibility_sha256', admission['compatibility'])
        self.ok(f'activate {SHA} {RUN}')

    # Red if the isolated dump validator accepts no approval, an unchecked file or stale creation.
    def test_separately_approved_dump_validator(self):
        from evidence import backup
        from contract import digest
        binding = {'sha': SHA, 'ci_run_id': RUN, 'archive_sha256': 'sha256:' + '1' * 64,
                   'image_id': PREVIOUS}
        proof = {'format': 'pg_dump-Fc', 'reference': 'host-backup:synthetic',
            'completed_at': int(time.time()), 'verified_at': int(time.time()),
            'receipt_digest': digest(binding), 'restore_list_ok': True, 'sha256_verified': True,
            'backup_sha256': 'sha256:' + '9' * 64}
        with self.assertRaisesRegex(Denied, 'backup-lane'):
            backup(proof, binding, self.config)
        self.assertEqual(backup(proof, binding, self.config, 'approved-migration')['format'], 'pg_dump-Fc')
        with self.assertRaisesRegex(Denied, 'backup-unverified'):
            backup({**proof, 'restore_list_ok': False}, binding, self.config, 'approved-migration')
        with self.assertRaisesRegex(Denied, 'stale-evidence'):
            backup({**proof, 'completed_at': 1}, binding, self.config, 'approved-migration')

    # Red if actual writer/schema/Compose code is mistaken for innocuous worker prose.
    def test_sensitive_code_classification(self):
        self.assertEqual(receive(self.root)[0].returncode, 0)
        for path in ('apps/intelligence-worker/src/main.ts', 'apps/agent-runtime/src/main.ts',
                     'libs/platform-persistence/prisma/migrations/new/migration.sql',
                     'docker-compose.private.yml', 'ops/compose/private.yaml', 'schema.prisma'):
            mutate(self.root, paths=[path])
            self.denied(f'admit {SHA} {RUN}', 'sensitive-files')
        self.no_execution()

    # Red if request-echo ready:true or a replacement target during HTTP probing passes.
    def test_readiness_echo_and_target_replacement_denied(self):
        for flags in ({'echo_probe': True}, {'replace_probe_target': True}):
            mutate(self.root, echo_probe=False, replace_probe_target=False)
            mutate(self.root, **flags)
            self.assertEqual(receive(self.root)[0].returncode, 0)
            self.denied(f'admit {SHA} {RUN}', 'previous-unready')
        self.no_execution()

    # Real 10KiB sparse headers, with a 1TiB logical member: red if tarfile/hash can expand them.
    def test_outer_and_inner_sparse_bounded(self):
        item = tarfile.TarInfo('sparse')
        item.type, item.size = tarfile.GNUTYPE_SPARSE, 1 << 40
        data = item.tobuf(format=tarfile.GNU_FORMAT) + bytes(10240 - 512)
        path = self.root / 'sparse.tar'
        path.write_bytes(data)
        checksum = 'sha256:' + hashlib.sha256(data).hexdigest()
        started = time.monotonic()
        with self.assertRaisesRegex(Denied, 'archive-sparse'):
            inspect_archive(path, checksum, PREVIOUS, SHA, RUN, '/app/prisma/migrations')
        with self.assertRaisesRegex(Denied, 'archive-sparse'):
            self.inspect([data])
        pax = io.BytesIO()
        with tarfile.open(fileobj=pax, mode='w', format=tarfile.PAX_FORMAT) as tar:
            item = tarfile.TarInfo('pax-sparse')
            item.pax_headers = {'GNU.sparse.realsize': str(1 << 40)}
            tar.addfile(item, io.BytesIO(b''))
        with self.assertRaisesRegex(Denied, 'archive-sparse'):
            self.inspect([pax.getvalue()])
        self.assertLess(time.monotonic() - started, 2)

    # Real gzip expansion (tiny compressed tar with megabytes of zero padding), no mocked reads.
    def test_decompression_bomb_bounded(self):
        started = time.monotonic()
        with self.assertRaisesRegex(Denied, 'layer-expansion-limit'):
            self.inspect([layer([(SQL, b'SELECT 1;')]) + bytes(2 * 1024**2)], modern=True)
        self.assertLess(time.monotonic() - started, 2)

    # Real subprocess pipe, partial bytes OR exact bytes with withheld EOF must release flock.
    def test_stalled_receive_and_eof_deadline_release_lock(self):
        path, image, checksum = archive(self.root)
        data = path.read_bytes()
        command = f'receive {SHA} {RUN} {checksum} {image} {len(data)}'
        code = ('import bounds,runpy; bounds.RECEIVE_SECONDS=0.25; '
                'runpy.run_path("test_support.py",run_name="__main__")')
        for payload in (data[:1], data):
            process = subprocess.Popen([sys.executable, '-B', '-c', code, str(self.root), command],
                cwd=HERE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            started = time.monotonic()
            try:
                process.stdin.write(payload)
                process.stdin.flush()
                process.wait(timeout=4)
                self.assertEqual(process.returncode, 1, process.stderr.read())
                self.assertEqual(json.loads(process.stdout.read())['denied'], 'receive-deadline')
                self.assertLess(time.monotonic() - started, 3)
            finally:
                process.stdin.close()
                if process.poll() is None:
                    process.kill()
                process.wait()
                process.stdout.close()
                process.stderr.close()
            self.ok('status')
            self.assertEqual(list((self.state / 'inbox').iterdir()), [])
        self.no_execution()


if __name__ == '__main__':
    unittest.main()
