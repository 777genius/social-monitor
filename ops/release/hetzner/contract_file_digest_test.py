"""Real private-file reads and races; only temporary ancestry policy is bypassed."""
import hashlib
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from contract import Denied, private_file_digest


@unittest.skipUnless(os.geteuid() == 0, 'Private input fixtures must be root owned')
class PrivateFileDigestTests(unittest.TestCase):
    def setUp(self):
        # Linux tmpfs exercises access-time updates even if workspace is noatime.
        directory = tempfile.TemporaryDirectory(dir='/dev/shm')
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / 'synthetic-private-input.txt'
        self.data = b'synthetic static configuration'
        self.path.write_bytes(self.data)
        self.path.chmod(0o600)
        # Temporary ancestry is deliberately outside installed root trust policy.
        ancestry = patch('contract.trusted', lambda value: Path(value))
        ancestry.start()
        self.addCleanup(ancestry.stop)

    def hash_during(self, mutate):
        """Schedule a real filesystem change after the first real hash update."""
        checksum = hashlib.sha256()

        class DuringRead:
            changed = False

            def update(inner, chunk):
                checksum.update(chunk)
                if not inner.changed:
                    inner.changed = True
                    mutate()

            def hexdigest(inner):
                return checksum.hexdigest()

        with patch('contract.hashlib.sha256', return_value=DuringRead()):
            return private_file_digest(self.path)

    def test_first_read_with_old_atime_succeeds(self):
        # Red with full stat equality: the kernel advances atime during hashing.
        os.utime(self.path, (1, 1))
        before = self.path.stat()
        expected = 'sha256:b3e5640f171d8a6ef24d42dc2b041659360dd20a70e092a5a3a913bff6ed1c09'
        self.assertEqual(private_file_digest(self.path), expected)
        after = self.path.stat()
        self.assertGreater(after.st_atime_ns, before.st_atime_ns)
        self.assertEqual(after.st_mtime_ns, before.st_mtime_ns)
        self.assertEqual(after.st_ctime_ns, before.st_ctime_ns)
        self.assertEqual(private_file_digest(self.path), expected)

    def test_same_size_content_change_during_hash_is_denied(self):
        # Red if size/inode alone are checked: rewrite bytes on the same inode.
        before = self.path.stat()

        def mutate():
            self.path.write_bytes(b'X' * len(self.data))
            os.utime(self.path, ns=(before.st_atime_ns, before.st_mtime_ns + 1))
            after = self.path.stat()
            self.assertEqual(after.st_ino, before.st_ino)
            self.assertEqual(after.st_size, before.st_size)
            self.assertNotEqual(after.st_mtime_ns, before.st_mtime_ns)

        with self.assertRaisesRegex(Denied, '^trusted-input-changed$'):
            self.hash_during(mutate)
        self.assertEqual(self.path.read_bytes(), b'X' * len(self.data))

    def test_nanosecond_mtime_change_during_hash_is_denied(self):
        # Red with float/whole-second timestamps: these real mtimes round alike.
        timestamp = (time.time_ns() // 1_000_000_000) * 1_000_000_000
        os.utime(self.path, ns=(timestamp, timestamp))
        before = self.path.stat()

        def mutate():
            os.utime(self.path, ns=(timestamp, timestamp + 1))
            after = self.path.stat()
            self.assertEqual(after.st_mtime, before.st_mtime)
            self.assertEqual(after.st_mtime_ns, before.st_mtime_ns + 1)

        with self.assertRaisesRegex(Denied, '^trusted-input-changed$'):
            self.hash_during(mutate)

    def test_path_inode_replacement_during_hash_is_denied(self):
        # Red without pathname-vs-fd identity: the open fd still reads old bytes.
        replacement = self.path.with_name('replacement')
        replacement.write_bytes(self.data)
        replacement.chmod(0o600)
        before = self.path.stat()
        os.utime(replacement, ns=(before.st_atime_ns, before.st_mtime_ns))
        self.assertNotEqual(replacement.stat().st_ino, before.st_ino)
        with self.assertRaisesRegex(Denied, '^trusted-input-changed$'):
            self.hash_during(lambda: os.replace(replacement, self.path))
        self.assertEqual(self.path.read_bytes(), self.data)


if __name__ == '__main__':
    unittest.main()
