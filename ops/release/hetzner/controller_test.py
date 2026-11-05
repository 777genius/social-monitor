"""Behavioral tests. Each regression comment states the change that makes it red."""
import fcntl
import json
from pathlib import Path
import random
import tempfile
import unittest
from archive import inspect_archive
from contract import Denied, atomic, digest, parse, read_json
from test_support import (SHA, RUN, PREVIOUS, MIGRATION, archive, mutate, receive,
                          run, setup)

KEY = SHA + '-' + RUN


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.config = setup(self.root)
        self.state = self.root / 'state'

    def tearDown(self):
        self.temporary.cleanup()

    def ok(self, command, data=b''):
        result = run(self.root, command, data)
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        return json.loads(result.stdout)

    def denied(self, command, reason, data=b''):
        result = run(self.root, command, data)
        self.assertEqual(result.returncode, 1, (result.stdout, result.stderr))
        self.assertEqual(json.loads(result.stdout)['denied'], reason)

    def admitted(self):
        result, image = receive(self.root)
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        self.ok('admit ' + SHA + ' ' + RUN)
        return image

    # Red: admission keeps only a hash, so no immutable record can show the retry rows.
    def test_resolved_history_is_immutable_in_admission_activation_and_rollback_receipts(self):
        mutate(self.root, resolved_retry=True)
        self.admitted()
        path = self.state / 'admissions' / (KEY + '.json')
        original = path.read_bytes()
        admission = read_json(path)
        self.assertEqual(len(admission['database']['history']['rows']), 2)
        self.assertEqual(admission['database_hash'], digest(admission['database']))
        receipt = self.ok(f'activate {SHA} {RUN}')
        self.assertEqual(receipt['admission_database'], admission['database'])
        self.assertEqual(receipt['admission_database_hash'], admission['database_hash'])
        self.assertEqual(len(receipt['database']['history']['rows']), 2)
        self.assertEqual(receipt['database_hash'], digest(receipt['database']))
        activated = (self.state / 'receipts' / (KEY + '.json')).read_bytes()
        rollback = self.ok(f'rollback {SHA} {RUN}')
        self.assertEqual(rollback['database'], receipt['database'])
        self.assertEqual((self.state / 'receipts' / (KEY + '.json')).read_bytes(), activated)
        self.assertEqual(path.read_bytes(), original)

    # Red: recovery publishes fresh history before journaling it; a receipt crash
    # then leaves the immutable receipt bound to a different database observation.
    def test_recovery_history_survives_crash_after_receipt_publication(self):
        mutate(self.root, resolved_retry=True)
        self.admitted()
        mutate(self.root, crash_up=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        mutate(self.root, crash_receipt=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        path = self.state / 'receipts' / (KEY + '.json')
        original = path.read_bytes()
        receipt = self.ok(f'activate {SHA} {RUN}')
        self.assertEqual(receipt['database'], read_json(self.state / 'transactions' / (KEY + '.json'))['database'])
        self.assertEqual(path.read_bytes(), original)

    def commands(self):
        path = self.root / 'commands.jsonl'
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    # Red at 360f816: receiptless verify checks readiness but accepts malformed
    # retained history in either journal observation, even with matching hashes.
    def test_receiptless_verify_validates_both_retained_observations(self):
        import copy
        from datetime import timedelta
        from prisma_history import summarize, timestamp, utc
        image = self.admitted()
        mutate(self.root, crash_up=True)
        result = run(self.root, f'activate {SHA} {RUN}')
        self.assertEqual(result.returncode, -9, (result.stdout, result.stderr))
        target = read_json(self.root / 'fake.json')['target']
        self.assertEqual(target['image'], image)
        self.assertIs(target['running'], True)
        tx_path = self.state / 'transactions' / (KEY + '.json')
        self.assertEqual(list((self.state / 'receipts').iterdir()), [])
        original = read_json(tx_path)
        self.assertNotIn('outcome', original)
        self.assertIs(self.ok(f'verify {SHA} {RUN}')['verified'], True)
        # Age both retained observations beyond live freshness. Historical
        # verification must accept them without obtaining replacement evidence.
        for db in (original['database'], original['admission']['database']):
            db['observed_at'] -= 600
            proof = db['history']
            proof['observed_at'] = utc((timestamp(proof['observed_at'])
                                       - timedelta(seconds=600)).isoformat())
            proof['sha256'] = digest({k: v for k, v in proof.items() if k != 'sha256'})
        original['admission']['database_hash'] = digest(original['admission']['database'])
        atomic(tx_path, original)
        # Keep all retained records coherent so age/history policy is exercised.
        atomic(self.state / 'admissions' / (KEY + '.json'), original['admission'])
        mutate(self.root, read_only=False, main_sha='f' * 40)
        retained = tx_path.read_bytes()
        self.assertIs(self.ok(f'verify {SHA} {RUN}')['verified'], True)
        self.assertEqual(tx_path.read_bytes(), retained)
        for observation in ('database', 'admission'):
            for fault, reason in (('missing', 'history-shape'),
                                  ('digest', 'history-digest'),
                                  ('pending', 'database-evidence')):
                with self.subTest(observation=observation, fault=fault):
                    tx = copy.deepcopy(original)
                    db = tx['database'] if observation == 'database' else tx['admission']['database']
                    if fault == 'missing':
                        db.pop('history')
                    elif fault == 'digest':
                        db['history']['sha256'] = 'sha256:' + '0' * 64
                    else:
                        proof = db['history']
                        proof['rows'][-1]['finished_at'] = None
                        proof['sha256'] = digest({k: v for k, v in proof.items() if k != 'sha256'})
                        db['applied_migrations'], db['failed_migrations'] = summarize(proof)
                    tx['admission']['database_hash'] = digest(tx['admission']['database'])
                    atomic(tx_path, tx)
                    atomic(self.state / 'admissions' / (KEY + '.json'), tx['admission'])
                    retained = tx_path.read_bytes()
                    self.denied(f'verify {SHA} {RUN}', reason)
                    self.assertEqual(tx_path.read_bytes(), retained)
                    self.assertEqual(list((self.state / 'receipts').iterdir()), [])
        self.assertFalse((self.state / 'latch.json').exists())

    # Red at d6f23bd: matching journal/receipt and recomputed outer hashes bypass
    # all nested validation, including the admission observation, on reconciliation.
    def test_retained_history_denied_before_terminal_reconstruction(self):
        import copy
        self.admitted()
        mutate(self.root, crash_receipt=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        tx_path = self.state / 'transactions' / (KEY + '.json')
        receipt_path = self.state / 'receipts' / (KEY + '.json')
        activated = read_json(tx_path), read_json(receipt_path)
        mutate(self.root, crash_receipt=True)
        self.assertEqual(run(self.root, f'rollback {SHA} {RUN}').returncode, -9)
        rolled_back_path = self.state / 'receipts' / (KEY + '-rollback.json')
        rolled_back = read_json(tx_path), read_json(rolled_back_path)
        cases = [('missing', 'history-shape'), ('digest', 'history-digest'),
                 ('pending', 'database-evidence'), ('summary', 'history-summary'),
                 ('inventory', 'migration-required'), ('cluster', 'history-binding')]
        cases += [(k, 'history-binding') for k in
                  ('database', 'observer_role', 'port', 'system_identifier')]
        cases += [(k, 'database-evidence') for k in
                  ('server_major', 'read_only_role', 'transaction_read_only')]
        cases += [('identity_' + k, 'admission-database-identity') for k in
                  ('database', 'observer_role', 'port')]
        for outcome, originals, published, image in (
                ('activated', activated, receipt_path, activated[1]['image_id']),
                ('rolled-back', rolled_back, rolled_back_path, PREVIOUS)):
            for observation in ('admission_database', 'database'):
                for fault, reason in cases:
                    with self.subTest(outcome=outcome, observation=observation, fault=fault):
                        tx, receipt = copy.deepcopy(originals)
                        db = receipt[observation]
                        if fault == 'missing':
                            db.pop('history')
                        elif fault == 'digest':
                            db['history']['sha256'] = 'sha256:' + '0' * 64
                        elif fault == 'pending':
                            db['history']['rows'][-1]['finished_at'] = None
                        elif fault == 'summary':
                            db['applied_migrations'] = []
                        elif fault == 'inventory':
                            db['history']['rows'][-1]['checksum'] = '0' * 64
                            db['applied_migrations'][-1]['checksum'] = '0' * 64
                        elif fault == 'cluster':
                            db['system_identifier'] = db['history']['system_identifier'] = '2222222222222222222'
                        elif fault.startswith('identity_'):
                            field = fault.removeprefix('identity_')
                            db[field] = db['history'][field] = '5433' if field == 'port' else 'other'
                        else:
                            db[fault] = {'server_major': 17, 'read_only_role': False,
                                'transaction_read_only': False, 'port': '5433'}.get(fault, 'other')
                        if fault in ('pending', 'inventory', 'cluster') or fault.startswith('identity_'):
                            proof = db['history']
                            proof['sha256'] = digest({k: v for k, v in proof.items() if k != 'sha256'})
                            if fault == 'pending':
                                from prisma_history import summarize
                                db['applied_migrations'], db['failed_migrations'] = summarize(proof)
                        receipt[observation + '_hash'] = digest(db)
                        if observation == 'admission_database':
                            tx['admission']['database'] = db
                            tx['admission']['database_hash'] = digest(db)
                        else:
                            tx['database'] = db
                        fake = read_json(self.root / 'fake.json')
                        fake['target']['image'] = image
                        atomic(self.root / 'fake.json', fake)
                        # Each public reconstruction route sees matching durable records.
                        for verb in ('activate', 'rollback', 'verify'):
                            atomic(tx_path, tx)
                            atomic(published, receipt)
                            # Bind all three records; malformed proof must reach policy.
                            atomic(self.state / 'admissions' / (KEY + '.json'), tx['admission'])
                            self.denied(f'{verb} {SHA} {RUN}', reason)
                            self.assertNotIn('outcome', read_json(tx_path))

    # Red: coherently reduced journal/receipt inventory passes history policy
    # but must never replace the original immutable admission as the anchor.
    def test_retained_transaction_requires_original_immutable_admission(self):
        import copy
        import evidence as policies
        from prisma_history import summarize
        image = self.admitted()
        admission_path = self.state / 'admissions' / (KEY + '.json')
        admitted = admission_path.read_bytes()
        candidate_path = self.state / 'inbox' / (KEY + '.tar')
        candidate = candidate_path.read_bytes()
        self.ok(f'activate {SHA} {RUN}')
        tx_path = self.state / 'transactions' / (KEY + '.json')
        receipt_path = self.state / 'receipts' / (KEY + '.json')
        activated = read_json(tx_path), read_json(receipt_path)
        self.ok(f'rollback {SHA} {RUN}')
        rollback_path = self.state / 'receipts' / (KEY + '-rollback.json')
        restored = read_json(tx_path), read_json(rollback_path)
        for originals, published, target in ((activated, receipt_path, image),
                                             (restored, rollback_path, PREVIOUS)):
            tx, receipt = copy.deepcopy(originals)
            self.assertEqual(len(tx['admission']['migrations']), 1)
            tx['admission']['migrations'] = []
            for db in (tx['admission']['database'], tx['database']):
                proof = db['history']
                self.assertTrue(proof['rows'])
                self.assertTrue(all(r['name'] == MIGRATION for r in proof['rows']))
                proof['rows'] = []
                proof['row_count'] = 0
                proof['sha256'] = digest({k: v for k, v in proof.items() if k != 'sha256'})
                db['applied_migrations'], db['failed_migrations'] = summarize(proof)
                # This forgery is structurally valid under its reduced inventory.
                policies.historical_database(db, [], self.config['backup_identity']['system_identifier'])
            tx['admission']['database_hash'] = digest(tx['admission']['database'])
            receipt['admission_database'] = tx['admission']['database']
            receipt['admission_database_hash'] = tx['admission']['database_hash']
            receipt['database'] = tx['database']
            receipt['database_hash'] = digest(tx['database'])
            tx.pop('outcome')
            for with_receipt in (True, False):
                for phase in ('candidate-up', 'rolling-back'):
                    for verb in ('activate', 'verify', 'rollback'):
                        with self.subTest(target=target, receipt=with_receipt, phase=phase, verb=verb):
                            for path in (receipt_path, rollback_path):
                                path.unlink(missing_ok=True)
                            if with_receipt:
                                atomic(published, receipt)
                            tx['phase'] = phase
                            atomic(tx_path, tx)
                            fake = read_json(self.root / 'fake.json')
                            fake['target']['image'] = target
                            atomic(self.root / 'fake.json', fake)
                            before = {p: p.read_bytes() for p in self.state.rglob('*') if p.is_file()}
                            commands = self.commands()
                            self.denied(f'{verb} {SHA} {RUN}', 'transaction-binding')
                            self.assertEqual({p: p.read_bytes() for p in self.state.rglob('*') if p.is_file()}, before)
                            self.assertEqual(self.commands(), commands)
                            self.assertEqual(read_json(self.root / 'fake.json'), fake)
                            self.assertEqual(admission_path.read_bytes(), admitted)
                            self.assertEqual(candidate_path.read_bytes(), candidate)
                            self.assertFalse((self.state / 'latch.json').exists())

    # Red: an internally matching journal and immutable file copied from another
    # pair must not be consumed under the requested key, even with a receipt.
    def test_retained_transaction_anchor_uses_requested_pair(self):
        self.admitted()
        self.ok(f'activate {SHA} {RUN}')
        admission_path = self.state / 'admissions' / (KEY + '.json')
        tx_path = self.state / 'transactions' / (KEY + '.json')
        tx = read_json(tx_path)
        tx['admission'].update(sha='d' * 40, ci_run_id='124')
        atomic(admission_path, tx['admission'])
        atomic(tx_path, tx)
        for verb in ('activate', 'verify', 'rollback'):
            with self.subTest(verb=verb):
                before = {p: p.read_bytes() for p in self.state.rglob('*') if p.is_file()}
                commands = self.commands()
                self.denied(f'{verb} {SHA} {RUN}', 'admission-binding')
                self.assertEqual({p: p.read_bytes() for p in self.state.rglob('*') if p.is_file()}, before)
                self.assertEqual(self.commands(), commands)

    # Red if shared structural validation reintroduces live freshness into recovery
    # or rollback tries to obtain a new migration observation before restoring.
    def test_historical_proof_reconciles_and_restores_without_fresh_database(self):
        from datetime import timedelta
        from prisma_history import timestamp, utc
        self.admitted()
        mutate(self.root, crash_receipt=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        tx_path = self.state / 'transactions' / (KEY + '.json')
        receipt_path = self.state / 'receipts' / (KEY + '.json')
        tx, receipt = read_json(tx_path), read_json(receipt_path)
        for observation in ('admission_database', 'database'):
            db = receipt[observation]
            db['observed_at'] -= 600
            proof = db['history']
            proof['observed_at'] = utc((timestamp(proof['observed_at']) - timedelta(seconds=600)).isoformat())
            proof['sha256'] = digest({k: v for k, v in proof.items() if k != 'sha256'})
            receipt[observation + '_hash'] = digest(db)
        tx['admission']['database'] = receipt['admission_database']
        tx['admission']['database_hash'] = receipt['admission_database_hash']
        tx['database'] = receipt['database']
        atomic(tx_path, tx)
        atomic(receipt_path, receipt)
        atomic(self.state / 'admissions' / (KEY + '.json'), tx['admission'])
        original = receipt_path.read_bytes()
        mutate(self.root, read_only=False, main_sha='f' * 40)
        self.assertEqual(self.ok(f'activate {SHA} {RUN}')['outcome'], 'activated')
        mutate(self.root, crash_receipt=True)
        self.assertEqual(run(self.root, f'rollback {SHA} {RUN}').returncode, -9)
        self.assertEqual(self.ok(f'rollback {SHA} {RUN}')['outcome'], 'rolled-back')
        self.assertEqual(read_json(self.root / 'fake.json')['target']['image'], PREVIOUS)
        self.assertEqual(receipt_path.read_bytes(), original)
        self.assertFalse((self.state / 'latch.json').exists())

    # Red if interrupted recovery replaces malformed retained evidence with a
    # fresh observation and reports success. Restoration must still precede denial.
    def test_interrupted_recovery_invalid_retained_proof_restores_and_latches(self):
        self.admitted()
        mutate(self.root, crash_up=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        path = self.state / 'transactions' / (KEY + '.json')
        tx = read_json(path)
        tx['database']['history']['sha256'] = 'sha256:' + '0' * 64
        atomic(path, tx)
        self.denied(f'activate {SHA} {RUN}', 'rollback-failed-latched')
        self.assertEqual(read_json(self.root / 'fake.json')['target']['image'], PREVIOUS)
        self.assertNotIn('outcome', read_json(path))
        self.assertEqual(list((self.state / 'receipts').iterdir()), [])
        self.assertTrue((self.state / 'latch.json').exists())

    # Red if missing fresh migration evidence blocks safe interrupted restoration
    # even though both retained observations still prove unchanged migrations.
    def test_interrupted_recovery_restores_with_retained_proof_when_live_database_denied(self):
        self.admitted()
        mutate(self.root, crash_up=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        mutate(self.root, read_only=False)
        self.denied(f'activate {SHA} {RUN}', 'rolled-back')
        receipt = self.ok('receipt ' + KEY)
        self.assertEqual(receipt['outcome'], 'rolled-back')
        self.assertEqual(read_json(self.root / 'fake.json')['target']['image'], PREVIOUS)
        self.assertFalse((self.state / 'latch.json').exists())

    # Red: same-cluster fresh identity drift reaches import/up and new journal persistence.
    def test_initial_activation_rejects_database_identity_drift_before_import(self):
        self.admitted()
        path = self.state / 'admissions' / (KEY + '.json')
        original = path.read_bytes()
        for field, value in (('database', 'other_db'), ('observer_role', 'other_observer'),
                             ('port', '5433')):
            with self.subTest(field=field):
                mutate(self.root, database_context={field: value})
                self.denied(f'activate {SHA} {RUN}', 'admission-database-identity')
                self.assertEqual(path.read_bytes(), original)
                self.assertEqual(list((self.state / 'transactions').iterdir()), [])
                self.assertEqual(list((self.state / 'receipts').iterdir()), [])
                self.assertFalse((self.state / 'retention.json').exists())
                self.assertFalse(any('load' in c or 'up' in c for c in self.commands()))
                self.assertEqual(read_json(self.root / 'fake.json')['target']['image'], PREVIOUS)

    # Red: recovery journals fresh identity drift, contaminating the rollback proof
    # and falsely latching after the original image is safely restored.
    def test_interrupted_activation_identity_drift_rolls_back_with_original_proof(self):
        for field, value in (('database', 'other_db'), ('observer_role', 'other_observer'),
                             ('port', '5433')):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                setup(root)
                result, image = receive(root)
                self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
                result = run(root, f'admit {SHA} {RUN}')
                self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
                mutate(root, crash_up=True)
                result = run(root, f'activate {SHA} {RUN}')
                self.assertEqual(result.returncode, -9, (result.stdout, result.stderr))
                self.assertEqual(read_json(root / 'fake.json')['target']['image'], image)
                state = root / 'state'
                path = state / 'transactions' / (KEY + '.json')
                original = read_json(path)
                admission_path = state / 'admissions' / (KEY + '.json')
                admitted = admission_path.read_bytes()
                mutate(root, database_context={field: value})
                result = run(root, f'activate {SHA} {RUN}')
                self.assertEqual(result.returncode, 1, (result.stdout, result.stderr))
                self.assertEqual(json.loads(result.stdout)['denied'], 'rolled-back')
                tx = read_json(path)
                self.assertEqual(tx['database'], original['database'])
                self.assertEqual(tx['admission'], original['admission'])
                self.assertEqual(admission_path.read_bytes(), admitted)
                receipt = read_json(state / 'receipts' / (KEY + '.json'))
                self.assertEqual(receipt['outcome'], 'rolled-back')
                self.assertEqual(receipt['database'], original['database'])
                self.assertEqual(receipt['database_hash'], digest(original['database']))
                self.assertEqual(tx['outcome'], 'rolled-back')
                self.assertEqual(read_json(root / 'fake.json')['target']['image'], PREVIOUS)
                self.assertFalse((state / 'latch.json').exists())
                published = state / 'receipts' / (KEY + '.json')
                published_bytes = published.read_bytes()
                result = run(root, f'rollback {SHA} {RUN}')
                self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
                self.assertEqual(json.loads(result.stdout), receipt)
                self.assertEqual(published.read_bytes(), published_bytes)
                commands = [json.loads(line) for line in (root / 'commands.jsonl').read_text().splitlines()]
                self.assertEqual(len([c for c in commands if 'up' in c]), 2)

    # Regression: a forced command accepts shell punctuation, extra arguments or unknown services.
    def test_grammar_fuzz(self):
        valid = ['status', 'preflight', f'admit {SHA} {RUN}', f'activate {SHA} {RUN}',
                 f'verify {SHA} {RUN}', f'rollback {SHA} {RUN}', f'receipt {KEY}',
                 f'receipt {KEY}-rollback',
                 f'receive {SHA} {RUN} sha256:{"d" * 64} sha256:{"e" * 64} 100']
        for command in valid:
            parse(command)
        invalid = ['', 'up api', 'activate api', 'status ', ' status', 'STATUS', 'status\n',
                   f'admit {SHA.upper()} {RUN}', f'admit {SHA} 0', f'admit {SHA} 01',
                   f'receive {SHA} {RUN} sha256:{"d" * 63} sha256:{"e" * 64} 1']
        random.seed(12)
        for _ in range(200):
            command = random.choice(valid)
            index = random.randrange(len(command) + 1)
            invalid.append(command[:index] + random.choice([';', '$', '`', '\n', '\t', '/', '\\', '"'])
                           + command[index:])
        for command in invalid:
            with self.assertRaises(Denied, msg=command):
                parse(command)
        self.denied('status;echo', 'grammar')
        self.assertEqual(self.commands(), [])

    # Regression: preflight creates a receipt, loads an image or starts a service.
    def test_preflight_is_read_only(self):
        before = {str(p): p.read_bytes() for p in self.state.rglob('*') if p.is_file()}
        self.ok('preflight')
        after = {str(p): p.read_bytes() for p in self.state.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        self.assertFalse(any('up' in c or 'load' in c for c in self.commands()))

    # Regression: a configured non-target selector accidentally points at API and weakens the fence.
    def test_non_target_selectors_must_match_service(self):
        config_path = self.root / 'config.json'
        config = json.loads(config_path.read_text())
        config['required_non_targets']['jev-agent-runtime'] = 'api'
        config_path.write_text(json.dumps(config))
        self.denied('preflight', 'non-target-selector')
        self.assertFalse(any('up' in c for c in self.commands()))

    # Regression: import occurs before archive byte length and SHA256 are checked.
    def test_receive_integrity_and_no_startup(self):
        path, image, checksum = archive(self.root)
        command = f'receive {SHA} {RUN} {checksum} {image} {path.stat().st_size}'
        self.denied(command, 'archive-short', path.read_bytes()[:-1])
        self.denied(command, 'archive-long', path.read_bytes() + b'x')
        bad = bytearray(path.read_bytes())
        bad[-1] = 1
        self.denied(command, 'archive-digest', bytes(bad))
        self.ok(command, path.read_bytes())
        self.ok(command, path.read_bytes())
        self.assertEqual(len(list((self.state / 'imports').glob('*.json'))), 1)
        self.assertFalse(any('load' in c or 'up' in c for c in self.commands()))
        self.assertEqual(len(list((self.state / 'inbox').iterdir())), 1)

    # Regression: an archive can load a foreign tag or labels for another CI run/revision.
    def test_archive_image_and_label_binding(self):
        for options, reason in [({'tags': ['shared:mutable']}, 'archive-tags-forbidden'),
                                ({'labels': {'org.opencontainers.image.revision': 'f' * 40,
                                             'social-monitor.ci-run-id': RUN}}, 'image-labels'),
                                ({'link': True}, 'migration-link-forbidden'),
                                ({'whiteout': True}, 'migration-layout')]:
            path, image, checksum = archive(self.root, **options)
            with self.assertRaisesRegex(Denied, reason):
                inspect_archive(path, checksum, image, SHA, RUN, '/app/prisma/migrations')
        path, image, checksum = archive(self.root)
        with self.assertRaisesRegex(Denied, 'image-config-digest'):
            inspect_archive(path, checksum, PREVIOUS, SHA, RUN, '/app/prisma/migrations')

    # Regression: activation bypasses the same-pair admission or nonwaiting lock.
    def test_admission_lock_identity_latch(self):
        result = run(self.root, f'activate {SHA} {RUN}')
        self.assertNotEqual(result.returncode, 0)
        with (self.state / 'controller.lock').open('r') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.denied('status', 'busy')
        mutate(self.root, identity='wrong')
        self.denied('status', 'machine-id')
        mutate(self.root, identity='b28fc7b17042414386eb9b114046e50c')
        atomic(self.state / 'latch.json', {'reason': 'synthetic'}, immutable=True)
        self.denied(f'activate {SHA} {RUN}', 'latched')
        self.assertFalse(any('up' in c for c in self.commands()))

    # Regression: a copied admission for another sha/run grants startup for an unadmitted pair.
    def test_admission_is_bound_to_exact_pair(self):
        self.admitted()
        other_sha, other_run = 'd' * 40, '124'
        old = read_json(self.state / 'admissions' / (KEY + '.json'))
        atomic(self.state / 'admissions' / (other_sha + '-' + other_run + '.json'), old)
        self.denied(f'activate {other_sha} {other_run}', 'admission-binding')
        self.assertFalse(any('up' in c or 'load' in c for c in self.commands()))

    # Regression: pending migrations, writable PG role, stale backup or sensitive diff are admitted.
    def test_admission_fails_closed(self):
        result, _ = receive(self.root)
        self.assertEqual(result.returncode, 0)
        for change, reason, undo in [({'migrations': []}, 'migration-required', {'migrations': [MIGRATION]}),
                                    ({'read_only': False}, 'database-evidence', {'read_only': True}),
                                    ({'backup_at': 1}, 'stale-evidence', {'backup_at': None}),
                                    ({'schema_changed': True}, 'sensitive-change', {'schema_changed': False}),
                                    ({'main_sha': 'f' * 40}, 'stale-main-skip', {'main_sha': SHA}),
                                    ({'bad_binding': True}, 'adapter-binding', {'bad_binding': False})]:
            mutate(self.root, **change)
            self.denied(f'admit {SHA} {RUN}', reason)
            if undo.get('backup_at', 'missing') is None:
                import time
                undo['backup_at'] = int(time.time())
            mutate(self.root, **undo)
        self.assertEqual(list((self.state / 'admissions').iterdir()), [])
        self.assertFalse(any('up' in c or 'load' in c for c in self.commands()))

    # Regression: activation pins the shared tag/JEv, loses env-file/secret mounts or claims success without probes.
    def test_activation_is_api_only_and_receipt_is_immutable(self):
        image = self.admitted()
        before = json.loads((self.root / 'fake.json').read_text())['containers']
        receipt = self.ok(f'activate {SHA} {RUN}')
        self.assertEqual(receipt['outcome'], 'activated')
        self.assertEqual(receipt['scope'], ['api'])
        self.assertEqual(receipt['snapshot_before_hash'], receipt['snapshot_after_hash'])
        state = json.loads((self.root / 'fake.json').read_text())
        self.assertEqual(state['containers'], before)
        self.assertEqual(state['target']['image'], image)
        override = read_json(self.state / 'overrides' / (KEY + '.json'))
        self.assertEqual(override, {'services': {'api': {'image': image}}})
        up = [c for c in self.commands() if 'up' in c]
        self.assertEqual(len(up), 1)
        self.assertEqual(up[0][-7:], ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'])
        original = (self.state / 'receipts' / (KEY + '.json')).read_bytes()
        self.ok(f'activate {SHA} {RUN}')
        self.ok(f'verify {SHA} {RUN}')
        self.assertEqual((self.state / 'receipts' / (KEY + '.json')).read_bytes(), original)
        self.assertEqual(len([c for c in self.commands() if 'up' in c]), 1)

    # Regression: readiness failure returns zero or leaves the candidate active.
    def test_readiness_rollback_nonzero_and_latch(self):
        image = self.admitted()
        mutate(self.root, unready=[image])
        self.denied(f'activate {SHA} {RUN}', 'rolled-back')
        self.assertEqual(self.ok('receipt ' + KEY)['outcome'], 'rolled-back')
        self.assertEqual(json.loads((self.root / 'fake.json').read_text())['target']['image'], PREVIOUS)
        self.denied(f'activate {SHA} {RUN}', 'already-rolled-back')

    # Regression: failed rollback allows another activate instead of persisting a latch.
    def test_rollback_failure_durable_latch(self):
        image = self.admitted()
        mutate(self.root, unready=[image, PREVIOUS])
        self.denied(f'activate {SHA} {RUN}', 'rollback-failed-latched')
        latch = (self.state / 'latch.json').read_bytes()
        self.denied(f'activate {SHA} {RUN}', 'latched')
        self.assertEqual((self.state / 'latch.json').read_bytes(), latch)
        self.assertEqual(list((self.state / 'receipts').iterdir()), [])

    # Regression: a SIGKILL after Compose succeeds creates a second up or unverified success.
    def test_crash_recovery_verifies_existing_target(self):
        image = self.admitted()
        mutate(self.root, crash_up=True)
        result = run(self.root, f'activate {SHA} {RUN}')
        self.assertEqual(result.returncode, -9, (result.stdout, result.stderr))
        self.assertEqual(json.loads((self.root / 'fake.json').read_text())['target']['image'], image)
        self.assertEqual(self.ok(f'activate {SHA} {RUN}')['outcome'], 'activated')
        self.assertEqual(len([c for c in self.commands() if 'up' in c]), 1)

    # Regression: an interrupted release for another pair or stale-main recovery starts a new target.
    def test_crash_recovery_stale_main_rolls_back(self):
        self.admitted()
        mutate(self.root, crash_up=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        self.denied('activate ' + 'd' * 40 + ' 124', 'unfinished-release')
        mutate(self.root, main_sha='f' * 40)
        self.denied(f'activate {SHA} {RUN}', 'rolled-back')
        self.assertEqual(json.loads((self.root / 'fake.json').read_text())['target']['image'], PREVIOUS)

    # Regression: recovery housekeeping failure rolls back an already published activation receipt.
    def test_recovery_retention_failure_preserves_verified_receipt(self):
        image = self.admitted()
        mutate(self.root, crash_up=True, fail_retention=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        self.denied(f'activate {SHA} {RUN}', 'fake-command-failed')
        original = (self.state / 'receipts' / (KEY + '.json')).read_bytes()
        fake = json.loads((self.root / 'fake.json').read_text())
        self.assertEqual(fake['target']['image'], image)
        self.assertFalse((self.state / 'latch.json').exists())
        mutate(self.root, fail_retention=False)
        self.assertEqual(self.ok(f'activate {SHA} {RUN}')['outcome'], 'activated')
        self.assertEqual((self.state / 'receipts' / (KEY + '.json')).read_bytes(), original)
        self.assertEqual(len([c for c in self.commands() if 'up' in c]), 1)

    # Regression: final receipt names the admission backup instead of the fresh activation proof.
    def test_activation_receipt_records_current_backup(self):
        import time
        now = int(time.time())
        mutate(self.root, backup_at=now - 10)
        self.admitted()
        original = read_json(self.state / 'admissions' / (KEY + '.json'))
        mutate(self.root, backup_at=now)
        receipt = self.ok(f'activate {SHA} {RUN}')
        self.assertEqual(receipt['backup']['verified_at'], now)
        self.assertEqual(read_json(self.state / 'admissions' / (KEY + '.json')), original)

    # Regression: resume verifies a fresh backup but publishes the older pre-crash backup proof.
    def test_recovery_receipt_records_current_backup(self):
        import time
        now = int(time.time())
        mutate(self.root, backup_at=now - 10)
        self.admitted()
        mutate(self.root, crash_up=True)
        self.assertEqual(run(self.root, f'activate {SHA} {RUN}').returncode, -9)
        mutate(self.root, backup_at=now)
        receipt = self.ok(f'activate {SHA} {RUN}')
        self.assertEqual(receipt['backup']['verified_at'], now)

    # Regression: rolling back an older release changes a newer unfinished release's previous target.
    def test_rollback_cannot_cross_unfinished_release(self):
        image = self.admitted()
        self.ok(f'activate {SHA} {RUN}')
        pending = read_json(self.state / 'transactions' / (KEY + '.json'))
        pending.pop('outcome')
        pending['phase'] = 'activating'
        pending['admission'].update(sha='d' * 40, ci_run_id='124',
                                    image_id='sha256:' + 'e' * 64, previous_image_id=image)
        atomic(self.state / 'transactions' / ('d' * 40 + '-124.json'), pending)
        before = len([c for c in self.commands() if 'up' in c])
        self.denied(f'rollback {SHA} {RUN}', 'unfinished-release')
        self.assertEqual(len([c for c in self.commands() if 'up' in c]), before)
        self.assertEqual(json.loads((self.root / 'fake.json').read_text())['target']['image'], image)

    # Regression: explicit rollback starts without fresh backup and disabled legacy workflow evidence.
    def test_explicit_rollback_refreshes_release_prerequisites(self):
        import time
        self.admitted()
        self.ok(f'activate {SHA} {RUN}')
        before = len([c for c in self.commands() if 'up' in c])
        mutate(self.root, backup_at=1)
        self.denied(f'rollback {SHA} {RUN}', 'stale-evidence')
        mutate(self.root, backup_at=int(time.time()), legacy='active')
        self.denied(f'rollback {SHA} {RUN}', 'preflight-unconfigured')
        self.assertEqual(len([c for c in self.commands() if 'up' in c]), before)
        mutate(self.root, legacy='disabled_manually')
        self.assertEqual(self.ok(f'rollback {SHA} {RUN}')['outcome'], 'rolled-back')

    # Regression: rollback overwrites the activation receipt or cannot reconcile a previous image.
    def test_explicit_rollback_preserves_activation_evidence(self):
        self.admitted()
        self.ok(f'activate {SHA} {RUN}')
        original = (self.state / 'receipts' / (KEY + '.json')).read_bytes()
        self.assertEqual(self.ok(f'rollback {SHA} {RUN}')['outcome'], 'rolled-back')
        self.assertEqual(self.ok('receipt ' + KEY + '-rollback')['outcome'], 'rolled-back')
        self.assertEqual((self.state / 'receipts' / (KEY + '.json')).read_bytes(), original)
        self.ok(f'rollback {SHA} {RUN}')

    # Regression: compose metadata for a non-target changes or a non-target starts during activation.
    def test_scope_and_snapshot_drift_fail_closed(self):
        self.admitted()
        mutate(self.root, scope_mutation=True)
        self.denied(f'activate {SHA} {RUN}', 'rollback-failed-latched')
        self.assertFalse(any('up' in c for c in self.commands()))

    # Regression: changed independently inspected revision labels pass admission reuse.
    def test_revision_proof_is_required(self):
        self.admitted()
        mutate(self.root, wrong_revision='f' * 40)
        self.denied(f'activate {SHA} {RUN}', 'previous-revision')
        self.assertEqual(list((self.state / 'receipts').iterdir()), [])
        self.assertFalse(any('up' in c or 'load' in c for c in self.commands()))

    # Regression: non-target/timer changes during up still publish an activated receipt.
    def test_non_target_drift_latches_without_success(self):
        self.admitted()
        mutate(self.root, drift_non_target=True)
        self.denied(f'activate {SHA} {RUN}', 'rollback-failed-latched')
        self.assertEqual(list((self.state / 'receipts').iterdir()), [])

    # Regression: changed fenced timer metadata after admission is ignored before startup.
    def test_fenced_timer_change_prevents_startup(self):
        self.admitted()
        mutate(self.root, unit_start='1234')
        self.denied(f'activate {SHA} {RUN}', 'non-target-changed')
        self.assertFalse(any('up' in c for c in self.commands()))

    # Regression: replacing admitted archive bytes after receive bypasses import revalidation.
    def test_admitted_archive_tampering_never_loads(self):
        self.admitted()
        path = self.state / 'inbox' / (KEY + '.tar')
        data = bytearray(path.read_bytes())
        data[-1] ^= 1
        path.write_bytes(data)
        self.denied(f'activate {SHA} {RUN}', 'archive-digest')
        self.assertFalse(any('load' in c or 'up' in c for c in self.commands()))

    # Regression: crash after receipt link but before transaction fsync cannot reconcile rollback.
    def test_rollback_receipt_publication_recovery(self):
        image = self.admitted()
        mutate(self.root, unready=[image])
        self.denied(f'activate {SHA} {RUN}', 'rolled-back')
        path = self.state / 'transactions' / (KEY + '.json')
        tx = read_json(path)
        tx.pop('outcome')
        atomic(path, tx)
        original = (self.state / 'receipts' / (KEY + '.json')).read_bytes()
        self.denied(f'activate {SHA} {RUN}', 'rolled-back')
        self.assertEqual((self.state / 'receipts' / (KEY + '.json')).read_bytes(), original)
        self.assertFalse((self.state / 'latch.json').exists())

    # Regression: rollback for an old receipt overwrites a newer independently changed target.
    def test_explicit_rollback_refuses_other_target(self):
        self.admitted()
        self.ok(f'activate {SHA} {RUN}')
        fake = json.loads((self.root / 'fake.json').read_text())
        fake['target']['image'] = 'sha256:' + '8' * 64
        (self.root / 'fake.json').write_text(json.dumps(fake))
        count = len([c for c in self.commands() if 'up' in c])
        self.denied(f'rollback {SHA} {RUN}', 'rollback-not-current')
        self.assertEqual(len([c for c in self.commands() if 'up' in c]), count)

    # Regression: retention invokes broad prune or deletes foreign/used image tags.
    def test_retention_keeps_three_and_only_removes_owned_unused_tags(self):
        from controller import Controller
        from host import Host
        from test_support import HERE
        import subprocess
        import sys
        class Commands(Host):
            def command(inner, argv, data=None):
                result = subprocess.run([sys.executable, '-B', str(HERE / 'fake_command.py'),
                                         str(self.root), *argv], input=data, capture_output=True, check=True)
                return result.stdout
        images = ['sha256:' + c * 64 for c in '12345']
        atomic(self.state / 'retention.json', images)
        mutate(self.root, used_images={images[0]: 'synthetic-running-container'},
               tags={'smrel-keep-' + image[7:]: image for image in images})
        for index in range(3):
            atomic(self.state / 'receipts' / (str(index) + '.json'), {
                'image_id': images[4 - index], 'previous_image_id': images[3 - index],
                'timings': {'started_at_ns': 3 - index}})
        Controller(self.config, Commands(self.config)).retention()
        self.assertEqual(read_json(self.state / 'retention.json'), images[2:][::-1] + [images[0]])
        removed = [c[-1] for c in self.commands() if c[1:3] == ['image', 'rm']]
        self.assertEqual(removed, ['smrel-keep-' + images[1][7:]])
        self.assertFalse(any('prune' in c for c in self.commands()))
        # Repeating housekeeping must skip an already removed tag and retain used ownership.
        Controller(self.config, Commands(self.config)).retention()
        self.assertEqual(len([c for c in self.commands() if c[1:3] == ['image', 'rm']]), 1)

    # Regression: racing immutable publication lets both conflicting writers overwrite a receipt.
    def test_racing_atomic_publication(self):
        import subprocess
        import sys
        from test_support import HERE
        path = self.state / 'receipts' / 'race.json'
        code = ("import sys; from pathlib import Path; from contract import atomic; "
                "atomic(Path(sys.argv[1]), {'writer':sys.argv[2]}, immutable=True)")
        processes = [subprocess.Popen([sys.executable, '-B', '-c', code, str(path), str(i)],
                                     cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                     for i in range(8)]
        statuses = []
        for process in processes:
            process.communicate(timeout=10)
            statuses.append(process.returncode)
        self.assertEqual(statuses.count(0), 1)
        self.assertIn(read_json(path)['writer'], [str(i) for i in range(8)])
        self.assertFalse(list(path.parent.glob('.pending-*')))

    # Regression: a reader sees partial JSON or an append-only file can be overwritten.
    def test_atomic_no_overwrite(self):
        path = self.state / 'receipts' / 'synthetic.json'
        atomic(path, {'complete': True}, immutable=True)
        with self.assertRaisesRegex(Denied, 'immutable-conflict'):
            atomic(path, {'complete': False}, immutable=True)
        self.assertEqual(read_json(path), {'complete': True})
        self.assertEqual(list(path.parent.glob('.pending-*')), [])


if __name__ == '__main__':
    unittest.main()
