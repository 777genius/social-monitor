"""Synthetic archive receive, durable publication, replay and failure cleanup."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import zipfile
from contract import Denied
from cohort_frontend_receive import receive_frontend
from frontend_bundle_test import archive_at, files, SHA


class FrontendReceiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='TEST-sm-front-receive-')
        self.root = Path(self.tmp.name)
        tar = self.root / 'frontend-release.tgz'
        manifest = archive_at(tar, files())
        self.archive = self.root / 'artifact.zip'
        with zipfile.ZipFile(self.archive, 'w') as output:
            output.writestr('frontend-release.tgz', tar.read_bytes())
            output.writestr('frontend-manifest.json', json.dumps(manifest).encode())
        data = self.archive.read_bytes()
        self.authority = {'sha': SHA, 'ci_run_id': '123', 'ci_run_attempt': '1', 'artifact_id': '456',
            'artifact_name': f'frontend-candidate-{SHA}-123-1', 'artifact_sha256': 'sha256:' + hashlib.sha256(data).hexdigest(),
            'artifact_bytes': len(data)}
        self.state = self.root / 'state'; self.state.mkdir(mode=0o700)
        self.host = type('Host', (), {'evidence': lambda _, verb, binding: {**self.authority, 'version': 1, 'observed_at': 1}})()
        self.core = type('Core', (), {'state': self.state, 'host': self.host})()

    def tearDown(self): self.tmp.cleanup()

    def receive(self):
        with self.archive.open('rb') as source, patch('cohort_frontend_receive.trusted', side_effect=lambda path, directory=False: Path(path)):
            return receive_frontend(self.core, SHA, '123', source)

    def test_publishes_and_replays_same_candidate(self):
        first = self.receive(); second = self.receive()
        self.assertEqual(first, second)
        bundle = Path(first['root'])
        self.assertEqual((bundle / 'public/release-sha.txt').read_text(), SHA + '\n')
        self.assertEqual((bundle / 'admin/release-sha.txt').read_text(), SHA + '\n')
        self.assertEqual(list((self.state / 'cohort/frontend/inbox').iterdir()), [])
        self.assertEqual(len(list((self.state / 'cohort/frontend/candidates').iterdir())), 1)

    def test_replay_rejects_changed_file_even_when_release_markers_remain_valid(self):
        first = self.receive()
        app = Path(first['root']) / 'public/main.dart.js'
        app.write_bytes(app.read_bytes() + b' injected')
        with self.assertRaisesRegex(Denied, 'frontend-candidate-content-changed'):
            self.receive()

    def test_controller_accepts_only_exact_locked_frontend_receive(self):
        from controller import Controller
        (self.state / 'controller.lock').touch()
        core = Controller({'state': str(self.state), 'inbox': str(self.state / 'inbox')}, self.host)
        core.fence = lambda: None
        with self.archive.open('rb') as source, \
             patch('cohort_frontend_receive.trusted', side_effect=lambda path, directory=False: Path(path)):
            proof = core.dispatch('cohort-receive-frontend ' + SHA + ' 123', source)
        self.assertEqual(proof['authority'], self.authority)
        with self.archive.open('rb') as source, \
             patch('cohort_frontend_receive.trusted', side_effect=lambda path, directory=False: Path(path)), \
             patch.object(self.host, 'evidence', wraps=self.host.evidence) as evidence:
            self.assertEqual(core.dispatch('cohort-receive-frontend-auth ' + SHA + ' 123', source), proof)
            self.assertEqual(evidence.call_args.args[0], 'cohort-frontend-authority')
        with self.assertRaises(Denied): core.dispatch('cohort-receive-frontend ' + SHA + ' 123 extra')
        (self.state / 'latch.json').write_text('{}')
        with self.archive.open('rb') as source, self.assertRaisesRegex(Denied, 'latched'):
            core.dispatch('cohort-receive-frontend ' + SHA + ' 123', source)

    def test_conflicting_existing_proof_and_bad_stream_are_denied(self):
        first = self.receive()
        proof = Path(first['root']).parent / 'proof.json'
        stored = json.loads(proof.read_text()); stored['manifest_sha256'] = 'sha256:' + '0' * 64
        proof.write_text(json.dumps(stored))
        with self.assertRaisesRegex(Denied, 'frontend-candidate-conflict'): self.receive()
        self.assertEqual((Path(first['root']) / 'public/release-sha.txt').read_text(), SHA + '\n')
        self.archive.write_bytes(self.archive.read_bytes()[:-1])
        with self.assertRaisesRegex(Denied, 'archive-short'): self.receive()
        self.assertEqual(list((self.state / 'cohort/frontend/inbox').iterdir()), [])

    def test_rejects_when_space_cannot_hold_zip_tar_spool_and_tree(self):
        from types import SimpleNamespace
        with patch('cohort_frontend_receive.shutil.disk_usage', return_value=SimpleNamespace(free=600 * 1024**2)):
            with self.assertRaisesRegex(Denied, 'disk-space'): self.receive()
        self.assertEqual(list((self.state / 'cohort/frontend/candidates').iterdir()), [])

    def test_untrusted_bytes_and_interrupted_publish_leave_no_candidate(self):
        self.authority['artifact_sha256'] = 'sha256:' + '0' * 64
        with self.assertRaises(Denied): self.receive()
        self.assertEqual(list((self.state / 'cohort/frontend/candidates').iterdir()), [])
        self.authority['artifact_sha256'] = 'sha256:' + hashlib.sha256(self.archive.read_bytes()).hexdigest()
        with patch('cohort_frontend_receive._sync_tree', side_effect=RuntimeError('interrupted')):
            with self.assertRaises(RuntimeError): self.receive()
        self.assertEqual(list((self.state / 'cohort/frontend/candidates').iterdir()), [])
        self.assertEqual(list((self.state / 'cohort/frontend/inbox').iterdir()), [])


if __name__ == '__main__': unittest.main()
