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
        for name in repair_module.CONTROLS:
            source = {'github-production-deploy.sh': 'social-monitor-production-deploy.sh',
                      'github-production-deploy-wrapper.sh': 'social-monitor-production-ssh-wrapper.sh'}.get(name, name)
            self.write('ops/deploy/' + source, 'installed control remains unchanged\n')
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

    def test_exact_production_preimage_compatibility_when_history_available(self):
        source = Path(__file__).resolve().parents[2]
        available = subprocess.run(['git', '-C', str(source), 'cat-file', '-e',
                                    repair_module.PREIMAGE + '^{commit}'],
                                   stderr=subprocess.DEVNULL, check=False).returncode == 0
        if not available:
            self.skipTest('historical production commit unavailable in shallow checkout')
        real = self.root / 'real-history'
        self.command('git', 'clone', '--no-local', '--no-checkout', '-q', str(source), str(real))
        target = self.command('git', '-C', str(source), 'rev-parse', 'HEAD').strip().decode()
        real_origin = self.root / 'real-origin.git'
        self.command('git', 'clone', '--bare', '--no-local', '-q', str(source), str(real_origin))
        self.command('git', '-C', str(real_origin), 'update-ref', 'refs/heads/main', target)
        self.command('git', '-C', str(real), 'remote', 'set-url', 'origin', str(real_origin))
        self.command('git', '-C', str(real), 'fetch', '-q', 'origin', 'main')
        self.command('git', '-C', str(real), 'checkout', '--detach', '-q', repair_module.PREIMAGE)
        entrypoint = real / 'ops/deploy/social-monitor-production-deploy.sh'
        # Real pathspecs and compatibility verifier, not the earlier mocked
        # component_changed=false shortcut. All filesystem effects are in /tmp.
        empty_control = self.root / 'real-control'
        (empty_control / 'deploy-state').mkdir(parents=True)
        for name in repair_module.MARKERS:
            (empty_control / 'deploy-state' / name).write_text(repair_module.LIVE + '\n')
        for name in repair_module.CONTROLS:
            source_name = {'github-production-deploy.sh': 'social-monitor-production-deploy.sh',
                           'github-production-deploy-wrapper.sh': 'social-monitor-production-ssh-wrapper.sh'}.get(name, name)
            (empty_control / name).write_bytes(self.command(
                'git', '-C', str(real), 'show', repair_module.LIVE + ':ops/deploy/' + source_name))
            (empty_control / name).chmod(0o755 if name.endswith(('deploy.sh', 'wrapper.sh', 'admission.sh')) else 0o644)
        script = '''set -euo pipefail
export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 SOCIAL_MONITOR_DEPLOY_ROOT="$1"
export SOCIAL_MONITOR_DEPLOY_REPO="$2" SOCIAL_MONITOR_DEPLOY_CONTROL="$3"
export PRODUCTION_TRANSITION_PRELUDE_COMMIT="$(git -C "$2" rev-parse HEAD)"
source "$2/ops/deploy/social-monitor-production-deploy.sh"
printf '%s\\n' "$5" > "$STATE/backend.sha"
component_changed backend "$4" "${BACKEND_PATHS[@]}"
postgres_pool_bootstrap_installed "$4"
verify_deploy_control_bridge_target_compatibility "$4"
verify_deploy_control_bridge_compatibility
'''
        args = ['bash', '-c', script, 'real-compatibility', str(self.root), str(real),
                str(empty_control), target, repair_module.LIVE]
        before = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        self.assertNotEqual(before.returncode, 0)
        self.assertIn(b'deploy the bridge release first', before.stderr)
        self.command('git', '-C', str(real), 'merge', '--ff-only', '--no-edit', target)
        after = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        self.assertEqual(after.returncode, 0, after.stderr.decode())
        self.assertEqual(entrypoint.read_bytes(), self.command(
            'git', '-C', str(real), 'show', repair_module.PREIMAGE + ':ops/deploy/social-monitor-production-deploy.sh'))


if __name__ == '__main__':
    unittest.main()
