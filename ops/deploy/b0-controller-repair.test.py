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
        # Hermetic disposable Git fixtures must not inherit a CI runner's LFS
        # filters or developer configuration. Production main() still refuses
        # all GIT_* overrides and checks the real machine configuration.
        environment = patch.dict(os.environ, {
            'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': str(self.root / 'git-config'),
        })
        environment.start()
        self.addCleanup(environment.stop)
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

    def test_durability_barrier_precedes_each_success_receipt(self):
        original = repair_module.execute
        barriers = []
        run = self.repair.run_path(self.target)

        def execute(*args):
            if args[0] == '/usr/bin/sync':
                receipt = 'control-repaired' if not barriers else 'ordinary-handoff'
                self.assertFalse((run / receipt).exists())
                barriers.append(receipt)
            return original(*args)

        with patch.object(repair_module, 'execute', side_effect=execute):
            self.repair.apply(self.target, self.approved)
            self.repair.handoff(self.target, self.approved)
        self.assertEqual(barriers, ['control-repaired', 'ordinary-handoff'])

    def test_failed_flush_does_not_certify_repair_or_close_rollback(self):
        original = repair_module.execute

        def execute(*args):
            if args[0] == '/usr/bin/sync':
                raise RuntimeError('simulated filesystem flush failure')
            return original(*args)

        with patch.object(repair_module, 'execute', side_effect=execute):
            with self.assertRaisesRegex(RuntimeError, 'flush failure'):
                self.repair.apply(self.target, self.approved)
        run = self.repair.run_path(self.target)
        self.assertFalse((run / 'control-repaired').exists())
        self.assertFalse((run / 'ordinary-handoff').exists())
        self.repair.rollback(self.target, self.approved)
        self.assert_preserved()

    def test_failed_handoff_flush_leaves_rollback_available(self):
        self.repair.apply(self.target, self.approved)
        original = repair_module.execute

        def execute(*args):
            if args[0] == '/usr/bin/sync':
                raise RuntimeError('simulated handoff flush failure')
            return original(*args)

        with patch.object(repair_module, 'execute', side_effect=execute):
            with self.assertRaisesRegex(RuntimeError, 'flush failure'):
                self.repair.handoff(self.target, self.approved)
        self.assertFalse((self.repair.run_path(self.target) / 'ordinary-handoff').exists())
        self.repair.rollback(self.target, self.approved)

    def test_handoff_rejects_git_clean_but_converted_bytes(self):
        self.repair.apply(self.target, self.approved)
        self.git('config', 'core.autocrlf', 'true')
        path = self.repo / repair_module.CONTROLLER
        path.unlink()
        self.git('restore', '--source=HEAD', '--worktree', repair_module.CONTROLLER)
        self.assertEqual(path.read_bytes(), b'new controller\r\n')
        self.git('add', repair_module.CONTROLLER)
        self.assertEqual(self.git('diff', '--cached'), b'')
        self.assertEqual(self.git('status', '--porcelain').strip(), b'')
        with self.assertRaisesRegex(RuntimeError, 'bytes/mode'):
            self.repair.handoff(self.target, self.approved)

    def test_apply_rejects_clean_conversion_after_merge(self):
        original = self.repair.git

        def git(*args):
            if args[0] == 'merge':
                original('config', 'core.autocrlf', 'true')
            result = original(*args)
            if args[0] == 'merge':
                self.assertEqual((self.repo / repair_module.CONTROLLER).read_bytes(), b'new controller\r\n')
                self.assertEqual(original('status', '--porcelain').strip(), b'')
            return result

        with patch.object(self.repair, 'git', side_effect=git):
            with self.assertRaisesRegex(RuntimeError, 'bytes/mode'):
                self.repair.apply(self.target, self.approved)
        self.assertFalse((self.repair.run_path(self.target) / 'control-repaired').exists())

    def test_handoff_checks_git_device_and_inode(self):
        self.repair.apply(self.target, self.approved)
        device, inode = self.plan['git_directory_identity']
        for changed in ([device + 1, inode], [device, inode + 1]):
            with patch.object(self.repair, 'git_directory_identity', return_value=changed):
                with self.assertRaisesRegex(RuntimeError, 'Git directory replaced'):
                    self.repair.handoff(self.target, self.approved)
        self.assertFalse((self.repair.run_path(self.target) / 'ordinary-handoff').exists())

    def test_handoff_revalidates_after_durability_barrier(self):
        self.repair.apply(self.target, self.approved)
        original = repair_module.execute

        def execute(*args):
            result = original(*args)
            if args[0] == '/usr/bin/sync':
                self.write(repair_module.CONTROLLER, 'concurrent mutation\n')
            return result

        with patch.object(repair_module, 'execute', side_effect=execute):
            with self.assertRaisesRegex(RuntimeError, 'dirty'):
                self.repair.handoff(self.target, self.approved)
        self.assertFalse((self.repair.run_path(self.target) / 'ordinary-handoff').exists())

    def test_wrong_plan_is_refused_before_writes(self):
        with self.assertRaisesRegex(RuntimeError, 'plan drifted'):
            self.repair.apply(self.target, '0' * 64)
        self.assertFalse(self.repair.run_path(self.target).exists())
        self.assert_preserved()

    def test_retired_marker_links_are_preserved_through_apply_and_handoff(self):
        linked = []
        for name in ('control.sha', 'postgres-pool-bootstrap.sha',
                     'production-transition-activated.sha', 'production-transition-review-consumption.v2'):
            marker = self.control / 'deploy-state' / name
            receipt = marker.with_name(name + '.next.retired.' + repair_module.digest(marker.read_bytes()))
            os.link(marker, receipt)
            linked.append((marker, receipt, marker.stat().st_ino))
        self.plan = self.repair.plan(self.target)
        self.approved = repair_module.digest(repair_module.canonical(self.plan))
        self.repair.apply(self.target, self.approved)
        self.repair.handoff(self.target, self.approved)
        for marker, receipt, inode in linked:
            self.assertEqual((marker.stat().st_ino, receipt.stat().st_ino), (inode, inode))
            self.assertEqual(marker.stat().st_nlink, 2)
        self.assert_preserved()

    def test_marker_unknown_or_forged_retired_links_are_refused_before_writes(self):
        marker = self.control / 'deploy-state/control.sha'
        receipt = marker.with_name(marker.name + '.next.retired.' + repair_module.digest(marker.read_bytes()))
        unknown = self.root / 'unexpected-link'
        os.link(marker, unknown)
        for forged in ('missing', 'same-bytes-different-inode', 'symlink'):
            with self.subTest(forged=forged):
                if forged == 'same-bytes-different-inode':
                    receipt.write_bytes(marker.read_bytes())
                elif forged == 'symlink':
                    receipt.symlink_to(marker)
                with self.assertRaises((RuntimeError, OSError)):
                    self.repair.apply(self.target, self.approved)
                self.assertFalse(self.repair.run_path(self.target).exists())
                if os.path.lexists(receipt):
                    receipt.unlink()

    def test_marker_retained_link_change_after_plan_is_refused(self):
        marker = self.control / 'deploy-state/control.sha'
        receipt = marker.with_name(marker.name + '.next.retired.' + repair_module.digest(marker.read_bytes()))
        os.link(marker, receipt)
        self.plan = self.repair.plan(self.target)
        self.approved = repair_module.digest(repair_module.canonical(self.plan))
        receipt.unlink()
        with self.assertRaisesRegex(RuntimeError, 'plan drifted'):
            self.repair.apply(self.target, self.approved)
        self.assertFalse(self.repair.run_path(self.target).exists())

    def test_nonmarker_hardlinks_and_unfinished_marker_are_refused(self):
        for path in (self.repo / repair_module.CONTROLLER,
                     self.control / 'github-production-deploy.sh',
                     self.control / 'production-deploy.lock'):
            with self.subTest(path=path):
                sibling = self.root / 'unexpected-link'
                os.link(path, sibling)
                with self.assertRaisesRegex(RuntimeError, 'unsafe file'):
                    self.repair.apply(self.target, self.approved)
                sibling.unlink()
        marker = self.control / 'deploy-state/control.sha'
        os.link(marker, marker.with_name(marker.name + '.next'))
        with self.assertRaisesRegex(RuntimeError, 'unfinished marker'):
            self.repair.apply(self.target, self.approved)
        self.assertFalse(self.repair.run_path(self.target).exists())

    def test_plan_refuses_untracked_files_hidden_by_git_configuration(self):
        self.git('config', 'status.showUntrackedFiles', 'no')
        self.write('hidden-untracked', 'unreviewed build input\n')
        self.assertEqual(self.git('status', '--porcelain').strip(), b'')
        with self.assertRaisesRegex(RuntimeError, 'integration is dirty'):
            self.repair.apply(self.target, self.approved)
        self.assertFalse(self.repair.run_path(self.target).exists())

    def test_handoff_refuses_untracked_files_hidden_by_git_configuration(self):
        self.repair.apply(self.target, self.approved)
        self.git('config', 'status.showUntrackedFiles', 'no')
        self.write('hidden-untracked', 'unreviewed build input\n')
        self.assertEqual(self.git('status', '--porcelain').strip(), b'')
        with self.assertRaisesRegex(RuntimeError, 'checkout is dirty'):
            self.repair.handoff(self.target, self.approved)
        self.assertFalse((self.repair.run_path(self.target) / 'ordinary-handoff').exists())
        self.assert_preserved()

    def test_runtime_restart_after_review_is_refused(self):
        with patch.object(self.repair, 'runtime_identity', return_value='restarted'):
            with self.assertRaisesRegex(RuntimeError, 'plan drifted'):
                self.repair.apply(self.target, self.approved)
        self.assertFalse(self.repair.run_path(self.target).exists())

    def test_tampered_installed_authority_is_not_accepted_as_a_new_plan(self):
        (self.control / 'production-transition-b0-host-control.sh').write_text('wrong authority\n')
        with self.assertRaisesRegex(RuntimeError, 'historical control differs'):
            self.repair.plan(self.target)
        self.assertFalse(self.repair.run_path(self.target).exists())

    def test_parent_receipt_directory_is_durable_before_git_mutation(self):
        events = []
        original_sync = repair_module.sync_directory
        original_git = self.repair.git

        def sync(path):
            events.append(('fsync', path))
            original_sync(path)

        def git(*args):
            if args[0] == 'merge':
                self.assertIn(('fsync', self.control), events)
                self.assertTrue((self.repair.run_path(self.target) / 'prepared').is_file())
            return original_git(*args)

        with patch.object(repair_module, 'sync_directory', side_effect=sync), patch.object(self.repair, 'git', side_effect=git):
            self.repair.apply(self.target, self.approved)

    def test_handoff_rejects_symlink_receipt(self):
        self.repair.apply(self.target, self.approved)
        receipt = self.repair.run_path(self.target) / 'control-repaired'
        receipt.rename(receipt.with_suffix('.saved'))
        receipt.symlink_to(receipt.with_suffix('.saved'))
        with self.assertRaises(OSError):
            self.repair.handoff(self.target, self.approved)

    def test_stopped_container_is_refused_even_without_restart_counter_change(self):
        rows = b'id image false 0 healthy started 0 []\n' * 12
        with patch.object(repair_module, 'execute', return_value=rows):
            with self.assertRaisesRegex(RuntimeError, 'stably running'):
                repair_module.ControllerRepair.runtime_identity(self.repair)

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

    def test_git_content_filters_remain_refused(self):
        self.git('config', 'filter.fixture.clean', 'false')
        with self.assertRaisesRegex(RuntimeError, 'content filters'):
            self.repair.apply(self.target, self.approved)
        self.assertEqual(self.git('config', '--get', 'filter.fixture.clean').strip(), b'false')
        self.assertFalse(self.repair.run_path(self.target).exists())

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
        # Exercise the complete real pre-activation deploy_release path,
        # including its early bootstrap return and all three legacy install
        # callsites. Stop at target-owned publication prebootstrap, which may
        # reconstruct runtime images. No Docker/DB effect belongs in this proof.
        full_release = script + '''
while read -r _ _ function_name; do
  [[ $function_name != production_transition_* ]] || readonly -f "$function_name"
done < <(declare -F)
action=deploy
load_target_reader_summary_publication_deploy_library() {
  [[ $1 == "$sha" ]]
  verify_deploy_control_bridge_compatibility
  printf 'real-pre-activation-boundary-reached\\n'
  exit 42
}
deploy_release "$4"
exit 99
'''
        for attempt in range(2):
            result = subprocess.run([*args[:2], full_release, *args[3:]],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            self.assertEqual(result.returncode, 42, f'fresh process {attempt}: {result.stderr.decode()}')
            self.assertIn(b'real-pre-activation-boundary-reached', result.stdout)
            self.assertEqual((empty_control / 'deploy-state/backend.sha').read_text(), repair_module.LIVE + '\n')
        for mode in ('tracked', 'staged', 'untracked', 'hidden-untracked'):
            untracked = mode.endswith('untracked')
            path = real / ('recovery-untracked.txt' if untracked else 'README.md')
            if mode == 'hidden-untracked':
                self.command('git', '-C', str(real), 'config', 'status.showUntrackedFiles', 'no')
            path.write_text('unreviewed application input\n')
            if mode == 'staged':
                self.command('git', '-C', str(real), 'add', 'README.md')
            result = subprocess.run([*args[:2], full_release, *args[3:]],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            self.assertNotEqual(result.returncode, 42, mode)
            self.assertIn(b'integration worktree is dirty', result.stderr, mode)
            self.assertNotIn(b'real-pre-activation-boundary-reached', result.stdout, mode)
            if untracked:
                path.unlink()
            else:
                self.command('git', '-C', str(real), 'restore', '--source=HEAD', '--staged', '--worktree', 'README.md')
        failing_status = full_release.replace('deploy_release "$4"', '''git() {
  [[ ${3:-} != status ]] || return 73
  command git "$@"
}
deploy_release "$4"''')
        result = subprocess.run([*args[:2], failing_status, *args[3:]],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        self.assertNotEqual(result.returncode, 42)
        self.assertIn(b'cannot inspect integration worktree', result.stderr)
        self.assertNotIn(b'real-pre-activation-boundary-reached', result.stdout)
        self.assertEqual(entrypoint.read_bytes(), self.command(
            'git', '-C', str(real), 'show', repair_module.PREIMAGE + ':ops/deploy/social-monitor-production-deploy.sh'))


if __name__ == '__main__':
    unittest.main()
