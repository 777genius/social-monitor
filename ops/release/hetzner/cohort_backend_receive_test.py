"""Bounded staging does not qualify, import or start a candidate image."""
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from contract import Denied
from cohort_backend_receive import receive_backend

SHA, RUN, IMAGE = 'a' * 40, '123', 'sha256:' + 'b' * 64


class BackendReceiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='TEST-sm-backend-receive-')
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state'; self.state.mkdir(mode=0o700)
        self.archive = self.root / 'candidate.tar'; self.archive.write_bytes(b'synthetic archive')
        self.checksum = 'sha256:' + hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.args = [SHA, RUN, self.checksum, IMAGE, str(self.archive.stat().st_size)]
        self.core = type('Core', (), {'state': self.state, 'c': {'max_archive_bytes': 10000,
                         'migration_root': '/app/prisma/migrations'}})()

    def tearDown(self): self.tmp.cleanup()

    def verify(self, path, checksum, image, sha, run, migration_root):
        if 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest() != checksum: raise Denied('archive-digest')
        return {'migrations': ['synthetic']}

    def receive(self):
        with self.archive.open('rb') as source, \
             patch('cohort_backend_receive.trusted', side_effect=lambda path, directory=False: Path(path)), \
             patch('cohort_backend_receive.inspect_archive', side_effect=self.verify):
            return receive_backend(self.core, self.args, source)

    def test_stages_exact_archive_and_replays_without_host_effects(self):
        item = self.receive()
        self.assertEqual(item, self.receive())
        self.assertEqual(item['archive_sha256'], self.checksum)
        stored = self.state / 'cohort/backend/inbox' / (SHA + '-' + RUN + '.tar')
        self.assertEqual(stored.read_bytes(), self.archive.read_bytes())
        self.assertEqual(len(list(stored.parent.iterdir())), 1)

    def test_controller_dispatch_is_locked_latched_and_exact(self):
        from controller import Controller
        (self.state / 'controller.lock').touch()
        core = Controller({**self.core.c, 'state': str(self.state), 'inbox': str(self.state / 'inbox')}, None)
        core.fence = lambda: None
        command = 'cohort-receive-backend ' + ' '.join(self.args)
        with self.archive.open('rb') as source, \
             patch('cohort_backend_receive.trusted', side_effect=lambda path, directory=False: Path(path)), \
             patch('cohort_backend_receive.inspect_archive', side_effect=self.verify):
            self.assertEqual(core.dispatch(command, source)['archive_sha256'], self.checksum)
        with self.assertRaises(Denied): core.dispatch(command + ' extra')
        (self.state / 'latch.json').write_text('{}')
        with self.archive.open('rb') as source, self.assertRaisesRegex(Denied, 'latched'):
            core.dispatch(command, source)

    def test_short_or_changed_stream_denied_without_publication(self):
        self.archive.write_bytes(b'bad')
        with self.assertRaisesRegex(Denied, 'archive-short'): self.receive()
        self.assertEqual(list((self.state / 'cohort/backend/inbox').iterdir()), [])
        self.archive.write_bytes(b'x' * int(self.args[-1]))
        with self.assertRaisesRegex(Denied, 'archive-digest'): self.receive()
        self.assertEqual(list((self.state / 'cohort/backend/inbox').iterdir()), [])


if __name__ == '__main__': unittest.main()
