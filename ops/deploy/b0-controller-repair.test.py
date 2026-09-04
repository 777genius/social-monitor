#!/usr/bin/env python3
"""Disposable repositories only: refusal, mixed Git crash states and preservation."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('b0-controller-repair.py'))
repair_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(repair_module)


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='b0-repair-test-', dir='/tmp')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repo = self.root / 'integration'
        self.repo.mkdir()
        self.command('git', 'init', '-q', '-b', 'main', str(self.repo))
        self.git('config', 'user.name', 'Repair fixture')
        self.git('config', 'user.email', 'repair@example.invalid')
        self.write('README', 'application source must stay unchanged\n')
        self.write('.gitignore', 'ignored/\n')
        self.write(repair_module.CONTROLLER, 'old controller\n')
        self.write('ops/deploy/production-transition-b0-bootstrap.test.sh', 'old test\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'test: preimage')
        self.base = self.git('rev-parse', 'HEAD').strip().decode()
        self.write(repair_module.CONTROLLER, 'new controller\n')
        self.write('ops/deploy/production-transition-b0-bootstrap.test.sh', 'new test\n')
        self.write('ops/deploy/b0-controller-repair.py', 'new repair\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'test: control-only repair')
        self.target = self.git('rev-parse', 'HEAD').strip().decode()
        self.origin = self.root / 'origin.git'
        self.command('git', 'clone', '--bare', '--no-local', '-q', str(self.repo), str(self.origin))
        self.git('remote', 'add', 'origin', str(self.origin))
        self.git('checkout', '--detach', '-q', self.base)
        self.other = self.root / 'other-worktree'
        self.git('worktree', 'add', '--detach', '-q', str(self.other), self.base)
        (self.other / 'uncommitted').write_text('another task\n')
        self.write('ignored/payload', 'keep local data\n')
        self.ignored_inode = (self.repo / 'ignored/payload').stat().st_ino
        self.other_head = (self.repo / '.git/worktrees/other-worktree/HEAD').read_bytes()
        self.control = self.root / 'control'
        state = self.control / 'deploy-state'
        state.mkdir(parents=True)
        for name in repair_module.STATE_FILES:
            (state / name).write_text(self.base + '\n')
        for name in repair_module.CONTROLS:
            (self.control / name).write_text('installed control remains unchanged\n')
        for name in (*repair_module.LOCKS, 'daily-run-singleton.lock'):
            (self.control / name).touch()
        runtime = self.control / 'postgres-runtime-releases' / self.base
        runtime.mkdir(parents=True)
        (runtime / 'READY').write_text(self.base + '\n')
        (self.control / 'postgres-runtime-current').symlink_to(runtime)
        self.repair = repair_module.ControllerRepair(
            self.root, self.base, self.base, repair_module.digest(b'new controller\n'))
        identity = patch.object(self.repair, 'runtime_identity', return_value='fixture-containers-unchanged')
        identity.start()
        self.addCleanup(identity.stop)
        self.plan = self.repair.plan(self.target)
        self.approved = repair_module.digest(repair_module.canonical(self.plan))

    def command(self, *args):
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        return result.stdout

    def git(self, *args):
        return self.command('git', '-C', str(self.repo), *args)

    def write(self, name, data):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)

    def assert_preserved(self):
        self.assertEqual((self.repo / 'ignored/payload').read_text(), 'keep local data\n')
        self.assertEqual((self.repo / 'ignored/payload').stat().st_ino, self.ignored_inode)
        self.assertEqual((self.repo / '.git/worktrees/other-worktree/HEAD').read_bytes(), self.other_head)
        self.assertEqual((self.other / 'uncommitted').read_text(), 'another task\n')
        self.assertEqual(self.repair.protected(), self.plan['protected'])

    def interrupt_merge(self, change):
        original = self.repair.git

        def interrupted(*args):
            if args[0] == 'merge':
                change()
                raise RuntimeError('simulated process loss inside Git fast-forward')
            return original(*args)

        with patch.object(self.repair, 'git', side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, 'process loss'):
                self.repair.apply(self.target, self.approved)
        self.assertTrue((self.repair.run_path(self.target) / 'prepared').is_file())
        self.assertFalse((self.repair.run_path(self.target) / 'control-repaired').exists())

    def test_apply_and_explicit_rollback_preserve_worktrees_and_data(self):
        self.repair.apply(self.target, self.approved)
        self.assertEqual(self.git('rev-parse', 'HEAD').strip().decode(), self.target)
        self.assert_preserved()
        self.repair.rollback(self.target, self.approved)
        self.assertEqual(self.git('rev-parse', 'HEAD').strip().decode(), self.base)
        self.assert_preserved()

    def test_partial_files_before_index_and_head_can_roll_back(self):
        def partial():
            self.write(repair_module.CONTROLLER, 'new controller\n')
            self.write('ops/deploy/b0-controller-repair.py', 'new repair\n')
        self.interrupt_merge(partial)
        self.repair.rollback(self.target, self.approved)
        self.assert_preserved()

    def test_partial_index_with_old_head_can_roll_back(self):
        def partial():
            self.write(repair_module.CONTROLLER, 'new controller\n')
            self.git('add', repair_module.CONTROLLER)
        self.interrupt_merge(partial)
        self.repair.rollback(self.target, self.approved)
        self.assert_preserved()

    def test_target_head_with_mixed_old_new_files_can_roll_back(self):
        def partial():
            self.git('merge', '--ff-only', '--no-edit', self.target)
            self.write(repair_module.CONTROLLER, 'old controller\n')
            self.git('add', repair_module.CONTROLLER)
        self.interrupt_merge(partial)
        self.repair.rollback(self.target, self.approved)
        self.assert_preserved()

    def test_unknown_partial_bytes_fail_closed_without_reset(self):
        self.interrupt_merge(lambda: self.write(repair_module.CONTROLLER, 'unknown truncated bytes'))
        with self.assertRaisesRegex(RuntimeError, 'unknown bytes'):
            self.repair.rollback(self.target, self.approved)
        self.assertEqual((self.repo / repair_module.CONTROLLER).read_text(), 'unknown truncated bytes')

    def test_git_lock_left_by_interrupted_process_is_not_removed(self):
        self.interrupt_merge(lambda: (self.repo / '.git/index.lock').touch())
        with self.assertRaisesRegex(RuntimeError, 'Git state'):
            self.repair.rollback(self.target, self.approved)
        self.assertTrue((self.repo / '.git/index.lock').exists())

    def test_protected_drift_and_unrelated_edits_forbid_rollback(self):
        self.repair.apply(self.target, self.approved)
        self.write('README', 'other writer changed source\n')
        with self.assertRaisesRegex(RuntimeError, 'unrelated edits'):
            self.repair.rollback(self.target, self.approved)
        self.assertEqual((self.repo / 'README').read_text(), 'other writer changed source\n')

    def test_handoff_permanently_closes_rollback(self):
        self.repair.apply(self.target, self.approved)
        self.repair.handoff(self.target, self.approved)
        with self.assertRaisesRegex(RuntimeError, 'handoff forbids'):
            self.repair.rollback(self.target, self.approved)

    def test_wrong_plan_is_refused_before_writes(self):
        with self.assertRaisesRegex(RuntimeError, 'plan drifted'):
            self.repair.apply(self.target, '0' * 64)
        self.assertFalse(self.repair.run_path(self.target).exists())
        self.assert_preserved()

    def test_runtime_restart_after_review_is_refused(self):
        with patch.object(self.repair, 'runtime_identity', return_value='restarted'):
            with self.assertRaisesRegex(RuntimeError, 'plan drifted'):
                self.repair.apply(self.target, self.approved)
        self.assertFalse(self.repair.run_path(self.target).exists())

    def test_production_or_authority_path_delta_is_refused(self):
        self.git('checkout', '--detach', '-q', self.target)
        self.write('README', 'application changed\n')
        self.git('add', 'README')
        self.git('commit', '-qm', 'test: forbidden application delta')
        forbidden = self.git('rev-parse', 'HEAD').strip().decode()
        self.git('push', '-q', 'origin', 'HEAD:refs/heads/main')
        self.git('checkout', '--detach', '-q', self.base)
        with self.assertRaisesRegex(RuntimeError, 'control-only'):
            self.repair.plan(forbidden)

    def test_hooks_are_refused_not_disabled(self):
        hook = self.repo / '.git/hooks/post-merge'
        hook.write_text('#!/bin/sh\nexit 0\n')
        hook.chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, 'invoke hook'):
            self.repair.apply(self.target, self.approved)
        self.assertTrue(hook.exists())

    def test_held_deploy_lock_and_symlink_marker_are_refused(self):
        with (self.control / 'production-deploy.lock').open('r+') as lock:
            repair_module.fcntl.flock(lock, repair_module.fcntl.LOCK_EX)
            with self.assertRaises(BlockingIOError):
                self.repair.apply(self.target, self.approved)
        marker = self.control / 'deploy-state/backend.sha'
        marker.rename(marker.with_suffix('.saved'))
        marker.symlink_to(marker.with_suffix('.saved'))
        with self.assertRaises(OSError):
            self.repair.apply(self.target, self.approved)


if __name__ == '__main__':
    unittest.main()
