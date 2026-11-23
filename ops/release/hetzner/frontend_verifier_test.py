"""Synthetic verifier generation/publication and startup fail-closed checks."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from contract import Denied
from frontend_tree import tree_digest
import frontend_verifier as verifier


class FrontendVerifierTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='TEST-sm-front-verifier-')
        self.parent = Path(self.temp.name)
        self.root = self.parent / 'bundle'; self.root.mkdir(mode=0o700)
        for lane in ('public', 'admin'):
            (self.root / lane).mkdir(mode=0o755)
            (self.root / lane / 'main.js').write_bytes(b'synthetic asset\x00')
            (self.root / lane / 'empty').write_bytes(b'')
        self.target = self.parent / 'verify.sh'
        self.seal = tree_digest(self.root)
        self.patches = [patch('frontend_verifier.trusted', side_effect=self.custody),
                        patch('frontend_verifier.os.geteuid', return_value=0)]
        for item in self.patches: item.start()

    def tearDown(self):
        for item in reversed(self.patches): item.stop()
        self.temp.cleanup()

    @staticmethod
    def custody(path, directory=False):
        path = Path(path)
        require = verifier.require
        require(not path.is_symlink() and (path.is_dir() if directory else path.is_file()), 'synthetic-custody')
        return path

    def generate(self, seal=None):
        return verifier.write_frontend_verifier(self.root, seal or self.seal, self.target)

    def runtime(self):
        # Only the fixed mount prefix changes for a local synthetic fixture. macOS
        # lacks GNU stat; this test-only wrapper implements its two used formats.
        bin_dir = self.parent / 'bin'; bin_dir.mkdir(exist_ok=True)
        stat = bin_dir / 'stat'
        stat.write_text('#!' + shutil.which('python3') + '\n'
                        'import os,stat,sys\n'
                        's=os.stat(sys.argv[-1]); mode=format(stat.S_IMODE(s.st_mode),"o")\n'
                        'print(mode if sys.argv[2]=="%a" else f"{mode}:{s.st_size}:{s.st_nlink}")\n')
        stat.chmod(0o755)
        sha = bin_dir / 'sha256sum'
        sha.write_text('#!' + shutil.which('python3') + '\n'
                       'import hashlib,sys\n'
                       'h=hashlib.sha256()\n'
                       'while chunk:=sys.stdin.buffer.read(65536): h.update(chunk)\n'
                       'print(h.hexdigest()+"  -")\n')
        sha.chmod(0o755)
        with patch('frontend_verifier.PREFIX', str(self.root) + '/'):
            script = verifier._script(verifier._records(self.root), self.seal)
        script = script.replace(b'export PATH=/usr/sbin:/usr/bin:/sbin:/bin',
                                ('export PATH=' + str(bin_dir) + ':/usr/bin:/bin').encode())
        local = self.parent / 'test-runtime.sh'; local.write_bytes(script)
        return lambda: subprocess.run(['/bin/bash', str(local)], stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, timeout=10, cwd=self.parent)

    def test_deterministic_immutable_publication_and_exact_replay(self):
        first = self.generate(); initial = self.target.stat()
        self.assertEqual(first, self.generate())
        self.assertEqual(self.target.stat().st_ino, initial.st_ino)
        self.assertEqual(initial.st_mode & 0o777, 0o555)
        self.assertEqual(first, {'path': str(self.target),
            'sha256': 'sha256:' + hashlib.sha256(self.target.read_bytes()).hexdigest()})
        self.assertEqual(list(self.parent.glob('.verifier-*')), [])

    def test_conflicts_symlinks_and_bad_target_never_overwrite(self):
        self.target.write_text('existing unrelated trusted bytes')
        with self.assertRaisesRegex(Denied, 'frontend-verifier-conflict'): self.generate()
        self.assertEqual(self.target.read_text(), 'existing unrelated trusted bytes')
        self.target.unlink(); victim = self.parent / 'victim'; victim.write_text('untouched')
        self.target.symlink_to(victim)
        with self.assertRaisesRegex(Denied, 'synthetic-custody'): self.generate()
        self.assertEqual(victim.read_text(), 'untouched')
        self.target.unlink()
        with self.assertRaisesRegex(Denied, 'frontend-verifier-target'):
            verifier.write_frontend_verifier(self.root, self.seal, self.root / 'verify.sh')

    def test_wrong_tree_and_mutation_during_record_read_do_not_publish(self):
        with self.assertRaisesRegex(Denied, 'frontend-verifier-tree'):
            self.generate('sha256:' + '0' * 64)
        original = verifier._records
        def changed(root):
            records = original(root)
            (root / 'public/main.js').write_bytes(b'changed')
            return records
        with patch('frontend_verifier._records', side_effect=changed), \
             self.assertRaisesRegex(Denied, 'frontend-verifier-tree'): self.generate()
        self.assertFalse(self.target.exists())

    def test_fsync_and_link_crash_windows_are_replayable(self):
        with patch('frontend_verifier.os.fsync', side_effect=OSError('synthetic disk error')):
            with self.assertRaises(OSError): self.generate()
        self.assertFalse(self.target.exists())
        with patch('frontend_verifier.sync_dir', side_effect=OSError('synthetic interrupted ack')):
            with self.assertRaises(OSError): self.generate()
        self.assertTrue(self.target.exists())
        self.assertEqual(self.generate()['path'], str(self.target))
        self.assertEqual(list(self.parent.glob('.verifier-*')), [])

    def test_names_are_data_even_with_shell_syntax_and_newlines(self):
        (self.root / 'public' / "x'$(touch SHOULD_NOT_EXIST)`id`\nend").write_bytes(b'opaque')
        self.seal = tree_digest(self.root)
        result = self.runtime()()
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, b'', b''))
        self.assertFalse((self.parent / 'SHOULD_NOT_EXIST').exists())

    def test_startup_rejects_changed_extra_missing_types_and_modes(self):
        for mutation in ('changed', 'extra', 'missing', 'symlink', 'directory', 'mode', 'hardlink'):
            with self.subTest(mutation=mutation):
                check = self.runtime()
                self.assertEqual(check().returncode, 0)
                path = self.root / 'public/main.js'
                original, mode = path.read_bytes(), path.stat().st_mode & 0o777
                extra = self.root / 'public/extra'
                if mutation == 'changed': path.write_bytes(b'x' * len(original))
                elif mutation == 'extra': extra.write_bytes(b'new')
                elif mutation == 'mode': path.chmod(0o600)
                elif mutation == 'hardlink': extra.hardlink_to(path)
                else:
                    path.unlink()
                    if mutation == 'symlink': path.symlink_to(self.root / 'admin/main.js')
                    if mutation == 'directory': path.mkdir()
                result = check()
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(original, result.stdout + result.stderr)
                if extra.exists(): extra.unlink()
                if path.is_dir(): path.rmdir()
                elif path.exists() or path.is_symlink(): path.unlink()
                path.write_bytes(original); path.chmod(mode)

    def test_large_runtime_file_fails_before_hash_read(self):
        check = self.runtime()
        with (self.root / 'public/main.js').open('r+b') as stream: stream.truncate(100_000_000)
        result = check()
        self.assertNotEqual(result.returncode, 0)

    def test_generation_limits_and_nonroot_fail_closed(self):
        with patch('frontend_verifier.MAX_SCRIPT', 10), self.assertRaisesRegex(Denied, 'frontend-verifier-size'):
            self.generate()
        with patch('frontend_verifier.os.geteuid', return_value=501), self.assertRaisesRegex(Denied, 'frontend-verifier-root'):
            self.generate()
        self.assertFalse(self.target.exists())


if __name__ == '__main__': unittest.main()
