"""Full-tree digest detects otherwise invisible frontend changes."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from contract import Denied
from frontend_tree import tree_digest, tree_digest_sources


class FrontendTreeTests(unittest.TestCase):
    def test_content_names_and_modes_are_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for lane in ('public', 'admin'):
                (root / lane).mkdir()
                (root / lane / 'main.js').write_text('release marker')
            original = tree_digest(root)
            self.assertEqual(original, tree_digest_sources({'public': root / 'public', 'admin': root / 'admin'}))
            (root / 'public/main.js').write_text('release marker plus injected bytes')
            self.assertNotEqual(tree_digest(root), original)
            (root / 'public/main.js').write_text('release marker')
            self.assertEqual(tree_digest(root), original)
            (root / 'public/main.js').chmod(0o600)
            self.assertNotEqual(tree_digest(root), original)
            (root / 'public/extra').symlink_to('main.js')
            with self.assertRaisesRegex(Denied, 'frontend-tree-member'): tree_digest(root)

    def test_walk_errors_are_not_silently_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for lane in ('public', 'admin'): (root / lane).mkdir()
            def failed_walk(_root, *, followlinks, onerror):
                onerror(PermissionError('synthetic'))
                return iter(())
            with patch('frontend_tree.os.walk', side_effect=failed_walk), \
                 self.assertRaisesRegex(Denied, 'frontend-tree-unreadable'):
                tree_digest(root)

    def test_independent_source_directories_are_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public, admin = root / 'one' / 'public', root / 'two' / 'admin'
            public.mkdir(parents=True); admin.mkdir(parents=True)
            (public / 'index').write_text('public'); (admin / 'index').write_text('admin')
            sources = {'public': public, 'admin': admin}
            original = tree_digest_sources(sources)
            (admin / 'index').write_text('changed')
            self.assertNotEqual(tree_digest_sources(sources), original)



if __name__ == '__main__': unittest.main()
