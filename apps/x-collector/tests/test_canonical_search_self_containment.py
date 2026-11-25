"""The differential suite must work from source files alone, without bootstrap."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from support import canonical_search_invocation_support as support


class OracleSelfContainment(unittest.TestCase):
    def test_hash_mismatch_fails_before_execution(self):
        with patch.object(Path, 'read_bytes', return_value=b'raise RuntimeError("untrusted")'):
            with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
                support.load_oracle()

    def test_fresh_copy_without_git_cache_or_test_artifacts(self):
        package = Path(__file__).resolve().parents[1]
        with TemporaryDirectory(prefix='canonical-search-fresh-') as directory:
            root = Path(directory)
            for name in ('src', 'tests'):
                shutil.copytree(package / name, root / name,
                                ignore=shutil.ignore_patterns('.cache', '.git', '__pycache__', '*.pyc'))
            def snapshot():
                return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in root.rglob('*') if p.is_file()}
            before = snapshot()
            self.assertFalse(any(p.name in ('.cache', '.git') for p in root.rglob('*')))
            env = dict(os.environ, PYTHONPATH=str(root / 'src') + os.pathsep + str(root / 'tests'),
                       PYTHONDONTWRITEBYTECODE='1')
            env.pop('CANONICAL_SEARCH_PARITY_OUTPUT', None)
            result = subprocess.run([
                sys.executable, '-B', '-m', 'unittest', '-v',
                'test_canonical_search_invocation', 'test_canonical_search_cache_parity',
            ], cwd=root, env=env, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('Ran 20 tests', result.stderr)
            self.assertNotIn('skipped', result.stderr.lower())
            self.assertEqual(snapshot(), before, 'Normal tests wrote source-tree artifacts')
            self.assertFalse(any(p.name in ('.cache', '.git', '__pycache__')
                                 for p in root.rglob('*')))
