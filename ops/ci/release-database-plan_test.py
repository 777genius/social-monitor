"""Real filesystem/CLI regressions; these tests do not establish API/PG readiness."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    'release_database_plan_test_target', HERE / 'release-database-plan.py')
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)
PINS = {
    'reader-summary-publication-pre-migration.sql':
        '1d3d70d6587ab6c232a37fb1feaa0de098dee22bf973462b824b350407c428d0',
    'reader-summary-publication-post-migration.sql':
        '231876dc900c42981985d47ac073cfce7baa46805d3e5373c9a7863a470e3233',
    'reader-summary-publication-tenant-ownership.sql':
        'cd85a07a070102cb31b5b5e3523760111a6e2bc286fa307f43348366947b9d6a'}


class DatabasePlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sm-database-plan-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.root.chmod(0o700)
        self.source = self.root / 'source'
        self.extracted = self.root / 'extracted'
        self.source.mkdir()
        self.extracted.mkdir()
        self.migrations = self.source / 'prisma' / 'migrations'
        self.migrations.mkdir(parents=True)
        self.before = [f'202601{index + 1:02d}000000_seed' for index in range(10)]
        self.names = self.before + [
            '20260716170000_reader_summary_fail_closed_publication',
            '20260801000000_extra', '20261001000000_future']
        self.sql = b'SELECT 1;\n'
        checksum = hashlib.sha256(self.sql).hexdigest()
        self.rows = [{'name': name, 'checksum': checksum} for name in self.names]
        for root in (self.migrations, self.extracted):
            for name in self.names:
                directory = root / name
                directory.mkdir()
                (directory / 'migration.sql').write_bytes(self.sql)
            (root / 'migration_lock.toml').write_bytes(b'provider = "postgresql"\n')
        for name, checksum in PINS.items():
            relative = 'scripts/sql' if name.endswith('tenant-ownership.sql') else 'ops/deploy'
            original = HERE.parents[1] / relative / name
            data = original.read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), checksum)
            destination = self.source / relative / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
        self.manifest = {
            'sha': 'a' * 40, 'ci_run_id': '123', 'image_id': 'sha256:' + 'b' * 64,
            'archive_sha256': 'sha256:' + 'c' * 64, 'archive_bytes': 123,
            'migrations': self.rows, 'image_graph': {'kind': 'oci-manifest'}}
        self.manifest_path = self.root / 'manifest.json'
        self.save()
        self.initial = self.root / 'initial'

    def save(self, value=None):
        self.manifest_path.write_text(json.dumps(self.manifest if value is None else value))

    def read(self):
        return plan.database_plan(str(self.manifest_path), str(self.source), str(self.extracted))

    def cli(self):
        return subprocess.run([
            sys.executable, '-I', '-B', str(HERE / 'release-database-plan.py'),
            '--manifest', str(self.manifest_path), '--source', str(self.source),
            '--extracted', str(self.extracted), '--initial', str(self.initial)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=15)

    def attacker_owned_ancestor(self):
        self.root.chmod(0o755)
        attacker = self.root / 'attacker'
        private = attacker / 'private'
        attacker.mkdir()
        private.mkdir(mode=0o700)
        os.chown(attacker, 65534, -1)
        self.addCleanup(os.chown, attacker, 0, -1)
        return private

    @unittest.skipUnless(sys.platform == 'linux' and os.geteuid() == 0,
                         'requires Linux root for disposable-tree ownership changes')
    def test_attacker_owned_ancestor_refuses_input_read(self):
        private = self.attacker_owned_ancestor()
        safe_output = self.root / 'safe-output'
        safe_output.mkdir(mode=0o700)
        self.initial = safe_output / 'initial'
        self.manifest_path = private / 'manifest.json'
        shutil.copyfile(self.root / 'manifest.json', self.manifest_path)
        sentinel = private / 'sentinel'
        sentinel.write_bytes(b'unchanged\n')
        result = self.cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'')
        self.assertIn(b'unsafe-ancestor', result.stderr)
        self.assertFalse(self.initial.exists())
        self.assertEqual(sentinel.read_bytes(), b'unchanged\n')

    @unittest.skipUnless(sys.platform == 'linux' and os.geteuid() == 0,
                         'requires Linux root for disposable-tree ownership changes')
    def test_attacker_owned_ancestor_refuses_output_copy(self):
        private = self.attacker_owned_ancestor()
        self.initial = private / 'initial'
        sentinel = private / 'sentinel'
        sentinel.write_bytes(b'unchanged\n')
        result = self.cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'')
        self.assertIn(b'unsafe-ancestor', result.stderr)
        self.assertFalse(self.initial.exists())
        self.assertEqual(sentinel.read_bytes(), b'unchanged\n')

    def test_cli_partition_and_readonly_copy(self):
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, b'')
        answer = json.loads(result.stdout)
        self.assertEqual(set(answer), {
            'version', 'first_migrations', 'bootstrap_hashes', 'bootstrap_files',
            'roles_sql', 'historical_create_sql', 'api_environment'})
        self.assertIs(type(answer['version']), int)
        self.assertEqual(answer['version'], 1)
        self.assertEqual(answer['first_migrations'], self.before)
        self.assertEqual(answer['bootstrap_hashes'], PINS)
        self.assertEqual(set(answer['bootstrap_files']), set(PINS))
        for name, value in answer['bootstrap_files'].items():
            relative = 'scripts/sql' if name.endswith('tenant-ownership.sql') else 'ops/deploy'
            self.assertEqual(value, str(self.source / relative / name))
        self.assertEqual({item.name for item in self.initial.iterdir()},
                         set(self.before) | {'migration_lock.toml'})
        self.assertEqual(stat.S_IMODE(self.initial.stat().st_mode), 0o755)
        for name in self.before:
            path = self.initial / name / 'migration.sql'
            self.assertEqual(path.read_bytes(), b'SELECT 1;\n')
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o444)
            self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o755)
        self.assertEqual((self.initial / 'migration_lock.toml').read_bytes(), b'provider = "postgresql"\n')
        self.assertEqual(answer['api_environment']['DATABASE_URL'],
                         'postgresql://e2e_api:synthetic-e2e-only@postgres:5432/e2e')
        self.assertIn('WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;', answer['roles_sql'])
        self.assertEqual(answer['historical_create_sql'],
                         'SET ROLE social_monitor_public_schema_owner; GRANT CREATE ON SCHEMA public '
                         'TO social_monitor_reader_summary_publication_owner '
                         'GRANTED BY social_monitor_public_schema_owner; RESET ROLE;')

    def test_either_inventory_sql_and_declared_hash_are_independent(self):
        for root in (self.migrations, self.extracted):
            path = root / self.before[0] / 'migration.sql'
            path.write_bytes(b'SELECT 2;\n')
            with self.assertRaises(plan.Refused):
                self.read()
            path.write_bytes(self.sql)
        self.manifest['migrations'][0]['checksum'] = '0' * 64
        self.save()
        with self.assertRaises(plan.Refused):
            self.read()

    def test_foreign_and_missing_inventory(self):
        for root in (self.migrations, self.extracted):
            foreign = root / '20261201000000_foreign'
            foreign.mkdir()
            with self.assertRaises(plan.Refused):
                self.read()
            foreign.rmdir()
            sql = root / self.before[0] / 'migration.sql'
            sql.unlink()
            with self.assertRaises(plan.Refused):
                self.read()
            sql.write_bytes(self.sql)

    def test_symlink_sql_directory_lock_and_ancestor(self):
        for relative in (self.before[0] + '/migration.sql', self.before[1], 'migration_lock.toml'):
            target = self.extracted / relative
            saved = self.root / 'saved-entry'
            target.rename(saved)
            target.symlink_to(saved, target_is_directory=saved.is_dir())
            with self.assertRaises(plan.Refused):
                self.read()
            target.unlink()
            saved.rename(target)
        alias = self.root / 'alias'
        alias.symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(plan.Refused):
            plan.database_plan(str(self.manifest_path), str(alias), str(self.extracted))

    def test_schema_bool_sorted_unique_and_exact_fields(self):
        bad = [
            [],
            {**self.manifest, 'archive_bytes': True},
            {**self.manifest, 'ci_run_id': 123},
            {**self.manifest, 'image_graph': False},
            {**self.manifest, 'migrations': self.rows + [self.rows[-1]]},
            {**self.manifest, 'migrations': list(reversed(self.rows))},
            {**self.manifest, 'migrations': [{**self.rows[0], 'checksum': True}] + self.rows[1:]},
            {**self.manifest, 'unexpected': 'field'}]
        for value in bad:
            self.save(value)
            with self.subTest(value=type(value).__name__):
                with self.assertRaises(plan.Refused):
                    self.read()
        self.save({key: value for key, value in self.manifest.items() if key != 'sha'})
        with self.assertRaises(plan.Refused):
            self.read()

    def test_bad_json_duplicate_nonfinite_limit_and_redacted_failure(self):
        raw = self.manifest_path.read_bytes()
        self.manifest_path.write_bytes(b'{"sha":"duplicate",' + raw[1:])
        with self.assertRaises(plan.Refused):
            self.read()
        self.save({**self.manifest, 'image_graph': {'kind': 'oci-manifest', 'value': float('nan')}})
        with self.assertRaises(plan.Refused):
            self.read()
        self.manifest_path.write_bytes(b'{' + b'x' * (4 * 1024 * 1024))
        result = self.cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'')
        self.assertFalse(self.initial.exists())
        self.assertNotIn(b'xxx', result.stderr)

    def test_lock_exact_presence_and_bytes(self):
        lock = self.extracted / 'migration_lock.toml'
        original = lock.read_bytes()
        lock.write_bytes(original + b'\n')
        with self.assertRaises(plan.Refused):
            self.read()
        lock.unlink()
        with self.assertRaises(plan.Refused):
            self.read()
        (self.migrations / 'migration_lock.toml').unlink()
        answer, _, lock_bytes = self.read()
        self.assertIsNone(lock_bytes)
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.initial / 'migration_lock.toml').exists())

    def test_changed_bootstrap_and_large_sql(self):
        path = self.source / 'ops/deploy/reader-summary-publication-pre-migration.sql'
        original = path.read_bytes()
        path.write_bytes(original + b'\n')
        with self.assertRaisesRegex(plan.Refused, 'canonical-bootstrap-source-mismatch'):
            self.read()
        path.write_bytes(original)
        sql = self.extracted / self.before[0] / 'migration.sql'
        with sql.open('r+b') as stream:
            stream.truncate(16 * 1024 * 1024 + 1)
        with self.assertRaises(plan.Refused):
            self.read()

    def test_initial_existing_or_public_parent_is_refused(self):
        self.initial.mkdir()
        result = self.cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'')
        self.initial.rmdir()
        self.root.chmod(0o755)
        result = self.cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.initial.exists())
        self.root.chmod(0o700)
        self.initial.symlink_to(self.source, target_is_directory=True)
        result = self.cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.initial.is_symlink())

    def test_partition_cannot_change_to_nine(self):
        self.rows[0]['name'] = '20261101000000_relocated'
        self.rows.sort(key=lambda row: row['name'])
        self.save()
        with self.assertRaisesRegex(plan.Refused, 'historical-first10-required'):
            self.read()


if __name__ == '__main__':
    unittest.main()
