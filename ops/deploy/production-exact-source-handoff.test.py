#!/usr/bin/env python3
"""Focused offline exact-history regression; never use a real project/runtime."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('fixture', Path(__file__).with_name('support') / 'production-exact-source-handoff-fixture.py')
f = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(f)
h = f.h


class HandoffTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.environment = patch.dict(os.environ, {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}, clear=True)
        cls.environment.start()
        cls.addClassCleanup(cls.environment.stop)
        cls.history = f.History()

    @classmethod
    def tearDownClass(cls):
        cls.history.temp.cleanup()

    def setUp(self):
        self.fx = self.history.fixture()
        self.addCleanup(self.fx.close)
        self.op, self.target = self.fx.handoff, self.fx.target
        self.repo, self.control = self.fx.repo, self.fx.control
        self.fx.review()

    def apply(self):
        self.op.apply(self.target, self.fx.approved)

    def git(self, *args, data=None):
        return f.git(self.repo, *args, data=data)

    def host(self, action):
        prefix = [] if os.geteuid() == 0 else ['unshare', '--user', '--map-root-user']
        return subprocess.run([*prefix, 'bash', str(Path(__file__).with_name('support') / 'production-exact-source-handoff-host.sh'),
                               str(self.fx.root), self.target, action], capture_output=True, timeout=60,
                              env=f.git_environment())

    def test_source_handoff_then_ordinary_host_and_client(self):
        before = self.host('client')
        self.assertNotEqual(before.returncode, 0)
        self.assertIn(b'invalid installed production controller recovery', before.stderr)
        self.apply()
        self.assertEqual(self.op.protected(), self.fx.plan['protected'])
        staged = self.host('check')
        self.assertEqual(staged.returncode, 0, staged.stderr.decode())
        self.assertIn(b'exact-11-and-ordinary-admission', staged.stdout)
        # Host checks may open existing lock files, so review identity is expected
        # to remain untouched: use a separate fixture check process after handoff.
        self.op.handoff(self.target, self.fx.approved)
        deployed = self.host('deploy')
        self.assertEqual(deployed.returncode, 0, (deployed.stdout + deployed.stderr).decode())
        self.assertIn(b'ordinary-deployed-exact-target', deployed.stdout)
        noop = self.host('noop')
        self.assertEqual(noop.returncode, 0, noop.stderr.decode())
        self.assertIn(b'frontend=false backend=false control=false', noop.stdout)
        self.assertTrue((self.fx.root / 'runtime-backup').is_dir())
        self.assertIn('runtime-backup-retained:', (self.fx.root / 'effects').read_text())
        after = self.host('client')
        self.assertEqual(after.returncode, 0, after.stderr.decode())
        with self.assertRaisesRegex(RuntimeError, 'handoff forbids'):
            self.op.rollback(self.target, self.fx.approved)

    def test_interruption_mixed_source_index_head_and_rollback(self):
        original = self.op.git
        def interrupted(*args, **kwargs):
            if args[0] == 'merge':
                original(*args)
                path = 'ops/deploy/backend-image-rescue-lib.sh'
                f.git(self.repo, 'restore', '--source=' + h.PREIMAGE, '--staged', '--worktree', '--', path)
                raise RuntimeError('interrupted')
            return original(*args, **kwargs)
        with patch.object(self.op, 'git', side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, 'interrupted'):
                self.apply()
        self.op.rollback(self.target, self.fx.approved)
        self.assertEqual(self.git('rev-parse', 'HEAD').strip().decode(), h.PREIMAGE)
        self.assertEqual(self.op.protected(), self.fx.plan['protected'])
        self.assertIn('syncfs', self.fx.effects)
        for name, mode in h.PREIMAGE_MODES.items():
            self.assertEqual((self.repo / name).stat().st_mode & 0o777, mode)

    def test_inventory_ignores_cli_caches_preserves_archives_and_restrictive_modes(self):
        protected = self.op.protected()
        self.assertEqual(len([k for k in protected if 'otel-collector-config-' in k]), 1)
        for name in self.fx.inert:
            path = 'control/deploy-state/' + name
            self.assertNotIn(path, protected)
            self.assertEqual((self.fx.root / path).read_text(), 'inert fixture archive\n')
        self.assertIn('social-monitor-weekly.service', protected['units'])
        for path in ('auth-current/state_5.sqlite-wal', 'auth-current/models_cache.json',
                     'control/unrelated-worker/prompts'):
            (self.fx.root / path).write_text('unrelated live activity\n')
            self.assertNotIn(path, protected)
        (self.fx.root / 'auth-current/tmp-new').touch()
        self.assertEqual(self.op.protected(), protected)
        previous = os.umask(0o077)
        try:
            self.apply()
        finally:
            os.umask(previous)
        for name in h.PREIMAGE_MODES:
            self.assertEqual((self.repo / name).stat().st_mode & 0o777,
                             int(self.op.entry(self.target, name)[0][-3:], 8))
        self.op.rollback(self.target, self.fx.approved)
        self.assertEqual(self.op.protected(), protected)

    def test_unknown_bytes_or_lock_never_reset(self):
        self.apply()
        unknown = self.op.run_path(self.target) / 'unrecognized.lock'
        unknown.touch()
        with self.assertRaisesRegex(RuntimeError, 'unknown incident run'):
            self.op.rollback(self.target, self.fx.approved)
        self.assertTrue(unknown.exists())
        unknown.unlink()
        path = self.repo / 'ops/deploy/backend-image-rescue-lib.sh'
        path.write_text('unknown source\n')
        with self.assertRaisesRegex(RuntimeError, 'unknown bytes'):
            self.op.rollback(self.target, self.fx.approved)
        lock = self.repo / '.git/index.lock'
        lock.touch()
        with self.assertRaisesRegex(RuntimeError, 'lock hazard'):
            self.op.rollback(self.target, self.fx.approved)
        self.assertEqual(path.read_text(), 'unknown source\n')
        self.assertTrue(lock.exists())

    def test_prepare_flush_failure_and_interrupted_rollback_resume(self):
        original_execute = self.fx.execute
        def failed_flush(*args):
            if args[0] == '/usr/bin/sync':
                raise RuntimeError('fixture prepare flush failure')
            return original_execute(*args)
        with patch.object(h.b0, 'execute', side_effect=failed_flush):
            with self.assertRaisesRegex(RuntimeError, 'prepare flush failure'):
                self.apply()
        self.assertEqual(self.git('rev-parse', 'HEAD').strip().decode(), h.PREIMAGE)
        self.assertTrue((self.op.run_path(self.target) / 'prepared').exists())
        original_git = self.op.git
        def interrupted_restore(*args):
            result = original_git(*args)
            if args[0] == 'restore' and args[-1] in h.PREIMAGE_MODES:
                raise RuntimeError('fixture interrupted rollback')
            return result
        with patch.object(self.op, 'git', side_effect=interrupted_restore):
            with self.assertRaisesRegex(RuntimeError, 'interrupted rollback'):
                self.op.rollback(self.target, self.fx.approved)
        self.op.rollback(self.target, self.fx.approved)
        self.assertTrue((self.op.run_path(self.target) / 'rolled-back').exists())
        for name, mode in h.PREIMAGE_MODES.items():
            self.assertEqual((self.repo / name).stat().st_mode & 0o777, mode)

    def test_wrong_main_tree_origin_and_retired_hardlink(self):
        original_execute = self.fx.execute
        def wrong_tree(*args):
            data = original_execute(*args)
            if args[0] == '/usr/bin/gh' and 'branches/main' in args[-1]:
                value = h.json.loads(data)
                value['commit']['commit']['tree']['sha'] = '0' * 40
                return h.canonical(value)
            return data
        with patch.object(h.b0, 'execute', side_effect=wrong_tree):
            with self.assertRaisesRegex(RuntimeError, 'main/tree drift'):
                self.apply()
        self.git('remote', 'set-url', 'origin', 'https://example.invalid/unreviewed.git')
        with self.assertRaisesRegex(RuntimeError, 'origin differs'):
            self.apply()
        self.git('remote', 'set-url', 'origin', h.b0.ORIGIN)
        marker = self.control / 'deploy-state/backend.sha'
        os.link(marker, self.control / 'unknown-link')
        with self.assertRaisesRegex(RuntimeError, 'unsafe state record'):
            self.apply()

    def test_target_operator_symlink_and_git_storage_hazards(self):
        for name in ('info/grafts', 'index.lock', 'objects/info/alternates'):
            path = self.repo / '.git' / name
            path.touch()
            with self.assertRaises(RuntimeError):
                self.apply()
            path.unlink()
        self.git('checkout', '--detach', '-q', self.target)
        path = self.repo / 'ops/deploy/production-exact-source-handoff.py'
        path.unlink()
        path.symlink_to('b0-controller-repair.py')
        self.git('add', '--', str(path))
        self.git('commit', '-qm', 'test: forbidden symlink')
        with self.assertRaisesRegex(RuntimeError, 'unsafe source mode/path'):
            self.op.delta(self.git('rev-parse', 'HEAD').decode().strip())

    def test_plan_marker_inode_and_lease_drift(self):
        marker = self.control / 'deploy-state/control.sha'
        marker.unlink()
        marker.write_text(h.LIVE + '\n')
        with self.assertRaisesRegex(RuntimeError, 'plan drifted'):
            self.apply()
        self.assertFalse(self.op.run_path(self.target).exists())
        self.git('update-ref', 'refs/remotes/origin/main', h.PREIMAGE)
        with self.assertRaisesRegex(RuntimeError, 'lease drift'):
            self.fx.review()

    def test_active_runs_rescues_and_priority_locks(self):
        for field in ('unit_active', 'auto_active', 'image_pins'):
            setattr(self.fx, field, True)
            with self.assertRaises(RuntimeError):
                self.apply()
            setattr(self.fx, field, False)
        for name in (*h.b0.LOCKS, *h.IDLE_LOCKS):
            with (self.control / name).open('r+') as stream:
                h.b0.fcntl.flock(stream, h.b0.fcntl.LOCK_EX)
                with self.assertRaises(BlockingIOError):
                    self.apply()
        for name in ('backend-image-rescue-' + h.PREIMAGE + '.tsv', 'control.sha.next',
                     '.postgres-pool-atomic-bootstrap-' + h.PREIMAGE, 'production-transition-unknown.lock'):
            residual = self.control / 'deploy-state' / name
            residual.write_text('unknown outstanding work\n')
            with self.assertRaises(RuntimeError):
                self.apply()
            self.assertTrue(residual.exists())
            residual.unlink()

    def test_wrong_parent_scope_blob_mode_deletion(self):
        wrong_parent = self.git('commit-tree', self.target + '^{tree}', '-p', h.PREIMAGE, data=b'wrong parent\n').decode().strip()
        with self.assertRaises(RuntimeError):
            self.op.delta(wrong_parent)
        for name, change in (('README.md', 'scope'), ('ops/deploy/backend-image-rescue-lib.sh', 'blob'),
                             ('ops/deploy/production-exact-source-handoff.py', 'mode'),
                             ('ops/deploy/production-exact-source-handoff.py', 'delete')):
            self.git('checkout', '--detach', '-q', self.target)
            path = self.repo / name
            if change == 'mode':
                path.chmod(0o755)
            elif change == 'delete':
                path.unlink()
            else:
                path.write_text('unreviewed\n')
            self.git('add', '--', name)
            self.git('commit', '-qm', 'test: forbidden ' + change)
            bad = self.git('rev-parse', 'HEAD').decode().strip()
            with self.assertRaises(RuntimeError):
                self.op.delta(bad)

    def test_hazards_and_no_source_execution(self):
        for key, value in (('core.hooksPath', '/tmp/unknown-hooks'), ('filter.bad.smudge', 'false'),
                           ('core.filemode', 'false'), ('gpg.program', '/tmp/unknown-gpg')):
            self.git('config', key, value)
            with self.assertRaises(RuntimeError):
                self.apply()
            self.git('config', '--unset', key)
        self.git('config', 'core.filemode', 'true')
        with patch.dict(os.environ, {'GIT_INDEX_FILE': '/tmp/no-such-index'}):
            with self.assertRaisesRegex(RuntimeError, 'environment'):
                self.apply()
        hook = self.repo / '.git/hooks/post-merge'
        hook.write_text('#!/bin/sh\nexit 89\n')
        hook.chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, 'invoke hook'):
            self.apply()
        self.assertTrue(hook.exists())

    def test_handoff_tree_mode_and_post_flush_lease_drift(self):
        self.apply()
        path = self.repo / 'ops/deploy/backend-image-rescue-lib.sh'
        path.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, 'bytes/mode'):
            self.op.handoff(self.target, self.fx.approved)
        path.chmod(0o644)
        original = self.fx.execute
        def execute(*args):
            output = original(*args)
            if args[0] == '/usr/bin/sync':
                self.git('update-ref', 'refs/remotes/origin/main', h.PREIMAGE)
            return output
        with patch.object(h.b0, 'execute', side_effect=execute):
            with self.assertRaisesRegex(RuntimeError, 'lease drift'):
                self.op.handoff(self.target, self.fx.approved)
        self.assertFalse((self.op.run_path(self.target) / 'ordinary-handoff').exists())

    def test_harmless_bound_hooks_with_partial_clone(self):
        hooks = self.repo / '.git/hooks'
        for name in ('pre-commit', 'pre-push'):
            (hooks / name).write_text('#!/bin/sh\nexit 89\n')
            (hooks / name).chmod(0o755)
        # Use an isolated root-owned hooks directory with the production policy.
        with patch.dict(h.SAFE_GIT_CONFIG, {'core.hookspath': str(hooks)}):
            self.git('config', 'core.hooksPath', str(hooks))
            self.fx.review()
            self.apply()
            self.op.rollback(self.target, self.fx.approved)
        self.assertEqual(self.git('rev-parse', 'HEAD').strip().decode(), h.PREIMAGE)
        self.assertEqual((hooks / 'pre-commit').read_text(), '#!/bin/sh\nexit 89\n')

    def test_config_drift_and_missing_target_object_precede_prepare(self):
        self.git('config', 'user.name', 'changed fixture config')
        with self.assertRaisesRegex(RuntimeError, 'plan drifted'):
            self.apply()
        self.fx.review()
        blob = self.op.entry(self.target, 'ops/deploy/production-exact-source-handoff.py')[1]
        path = self.repo / '.git/objects' / blob[:2] / blob[2:]
        path.rename(self.fx.root / 'held-object')
        with self.assertRaisesRegex(RuntimeError, 'missing target objects'):
            self.apply()
        self.assertFalse(self.op.run_path(self.target).exists())
        self.assertEqual(self.git('rev-parse', 'HEAD').strip().decode(), h.PREIMAGE)

    def test_auth_frontend_container_and_low_disk_drift(self):
        for field, value in (('running', False), ('restarts', 1)):
            setattr(self.fx, field, value)
            with self.assertRaises(RuntimeError):
                self.apply()
            setattr(self.fx, field, True if field == 'running' else 0)
        for name in ('auth-current/auth.json', 'runtime/frontend-releases/' + h.LIVE + '/public/release-sha.txt'):
            self.fx.review()
            path = self.fx.root / name
            original = path.read_bytes()
            original_mode = path.stat().st_mode & 0o777
            path.chmod(0o640)
            path.write_text('changed fixture\n')
            with self.assertRaisesRegex(RuntimeError, 'plan drifted|frontend release drift'):
                self.apply()
            path.write_bytes(original)
            path.chmod(original_mode)
        with patch.object(self.op, 'reserve', side_effect=RuntimeError('less than 5 GiB reserve')):
            with self.assertRaisesRegex(RuntimeError, '5 GiB'):
                self.apply()

    def test_foreign_worktree_admin_is_preserved_but_common_locks_refuse(self):
        foreign = self.repo / '.git/worktrees'
        foreign.mkdir(mode=0o755)
        admin = foreign / 'other-worker'
        admin.mkdir()
        lock = admin / 'index.lock'
        lock.write_bytes(b'foreign unfinished work\n')
        link = admin / 'external'
        link.symlink_to('/does-not-exist/foreign')
        before = (lock.stat(), lock.read_bytes(), link.lstat(), os.readlink(link))
        self.fx.review()
        self.apply()
        self.op.rollback(self.target, self.fx.approved)
        self.assertEqual(before, (lock.stat(), lock.read_bytes(), link.lstat(), os.readlink(link)))
        (self.repo / '.git/index.lock').touch()
        with self.assertRaisesRegex(RuntimeError, 'Git symlink/lock hazard'):
            self.op.hazards()

    def test_backup_mapping_survives_reversed_git_path_order(self):
        original = self.op.git
        def reversed_paths(*args, **kwargs):
            value = original(*args, **kwargs)
            if args[0] == 'diff' and '--name-only' in args and value:
                return b'\n'.join(reversed(value.splitlines())) + b'\n'
            return value
        with patch.object(self.op, 'git', side_effect=reversed_paths):
            self.fx.review()
            self.apply()
            self.op.check_run(self.target, self.fx.approved)
            self.assertEqual(list(self.fx.plan['entries']), sorted(self.fx.plan['entries']))
            self.op.rollback(self.target, self.fx.approved)
        self.assertEqual(self.git('rev-parse', 'HEAD').strip().decode(), h.PREIMAGE)

    def test_foreign_admin_root_must_be_safe(self):
        foreign = self.repo / '.git/worktrees'
        foreign.symlink_to(self.fx.root)
        with self.assertRaisesRegex(RuntimeError, 'unsafe directory'):
            self.op.hazards()
        foreign.unlink()
        foreign.mkdir(mode=0o777)
        foreign.chmod(0o777)
        with self.assertRaisesRegex(RuntimeError, 'unsafe directory'):
            self.op.hazards()

    def test_ignored_cache_is_preserved_but_target_collision_refuses(self):
        cache = self.repo / 'ops/deploy/__pycache__/unrelated.pyc'
        cache.parent.mkdir(exist_ok=True)
        cache.write_bytes(b'not executable fixture cache\n')
        self.git('check-ignore', str(cache))
        identity = lambda p: (p.stat().st_dev, p.stat().st_ino, p.stat().st_mode,
                              p.stat().st_mtime_ns, p.stat().st_ctime_ns, p.read_bytes())
        before = identity(cache)
        self.fx.review()
        self.apply()
        self.op.rollback(self.target, self.fx.approved)
        self.assertEqual(before, identity(cache))
        new = self.repo / 'ops/deploy/production-exact-source-handoff.py'
        (self.repo / '.git/info/exclude').write_text('/ops/deploy/production-exact-source-handoff.py\n')
        new.write_bytes(b'preexisting ignored user data\n')
        before = identity(new)
        with self.assertRaisesRegex(RuntimeError, 'new source path already exists'):
            self.op.plan(self.target)
        self.assertEqual(before, identity(new))

    def test_terminal_record_shape_and_identity_before_prepare_and_handoff(self):
        path = self.control / 'deploy-state/production-transition-b0-host.state'
        original = path.read_bytes()
        invalid = [b'version=wrong\nstatus=terminal\n',
                   original.replace(b'production-transition-b0-host-state-v1', b'bad-version'),
                   b'\n'.join([original.splitlines()[1], original.splitlines()[0], *original.splitlines()[2:]]) + b'\n',
                   original.replace(b'trusted-base=', b'trusted-base=z'),
                   original.replace(b'target=' + h.ACTIVATED.encode(), b'target=' + b'0' * 40),
                   original.replace(b'target-tree=' + self.op.tree(h.ACTIVATED).encode(), b'target-tree=' + b'0' * 40)]
        # Existing hardlink receipt is valid only for the original record. Remove
        # that fixture link so parser failures are tested, not retired-link hashes.
        retired = path.with_name(path.name + '.next.retired.' + h.digest(original))
        retired.unlink()
        self.fx.review()
        for value in invalid:
            with self.subTest(stage='prepare', record=value):
                path.write_bytes(value)
                with self.assertRaisesRegex(RuntimeError, 'transition terminal'):
                    self.apply()
                self.assertFalse(self.op.run_path(self.target).exists())
                path.write_bytes(original)
        self.fx.review()
        self.apply()
        for value in invalid:
            with self.subTest(stage='handoff', record=value):
                path.write_bytes(value)
                with self.assertRaisesRegex(RuntimeError, 'transition terminal'):
                    self.op.handoff(self.target, self.fx.approved)
                self.assertFalse((self.op.run_path(self.target) / 'ordinary-handoff').exists())
                path.write_bytes(original)

    def test_idle_legacy_auth_lock_is_held_and_active_refresh_refuses(self):
        path = self.fx.root / 'runtime/auth-account-cursor.lock'
        path.touch(mode=0o600)
        self.fx.review()
        before = path.stat()
        with self.op.locked(), path.open('rb') as competing:
            with self.assertRaises(BlockingIOError):
                h.b0.fcntl.flock(competing, h.b0.fcntl.LOCK_EX | h.b0.fcntl.LOCK_NB)
        with path.open('rb') as busy:
            h.b0.fcntl.flock(busy, h.b0.fcntl.LOCK_EX | h.b0.fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.apply()
        self.apply()
        self.assertEqual(before, path.stat())
        path.write_bytes(b'unknown\n')
        with self.assertRaisesRegex(RuntimeError, 'legacy auth coordination'):
            self.op.protected()
        path.write_bytes(b'')
        path.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, 'legacy auth coordination'):
            self.op.protected()
        path.chmod(0o600)
        (self.fx.root / 'runtime/auth-account-changed').touch()
        with self.assertRaisesRegex(RuntimeError, 'unfinished auth refresh'):
            self.op.protected()


if __name__ == '__main__':
    if '--owned-root-fixture' in sys.argv:
        sys.argv.remove('--owned-root-fixture')
        raise SystemExit(f.run_in_owned_root(sys.argv[1:]))
    if os.geteuid() != 0:
        probe = subprocess.run(['unshare', '--user', '--map-root-user', 'true'], capture_output=True, timeout=10)
        if probe.returncode:
            if os.environ.get('GITHUB_ACTIONS') != 'true':
                raise SystemExit('User namespaces unavailable: run this isolated test with --owned-root-fixture and sudo permission.')
            raise SystemExit(f.run_in_owned_root(sys.argv[1:]))
    unittest.main()
