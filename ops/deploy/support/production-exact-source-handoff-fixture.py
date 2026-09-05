"""Offline exact-history fixtures. Only new /tmp directories are ever mutated."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('handoff', SOURCE / 'ops/deploy/production-exact-source-handoff.py')
h = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(h)


def git_environment():
    return dict(os.environ, GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null', GIT_NO_LAZY_FETCH='1')


class FixtureProcesses:
    # Ignore the CI host's LFS configuration only in disposable child processes.
    # The operator's environment/config refusal policy is still exercised intact.
    def __getattr__(self, name):
        return getattr(subprocess, name)

    def run(self, args, **kwargs):
        return subprocess.run(args, env={**git_environment(), **kwargs.pop('env', {})}, **kwargs)


def command(*args, cwd=None, data=None):
    p = subprocess.run(args, cwd=cwd, input=data, capture_output=True, timeout=60, env=git_environment())
    if p.returncode:
        raise RuntimeError(p.stderr.decode())
    return p.stdout


def git(repo, *args, data=None):
    return command('/usr/bin/git', '-C', str(repo), *args, data=data)


class History:
    def __init__(self):
        if shutil.disk_usage('/tmp').free < 5 * 1024**3:
            raise RuntimeError('less than 5 GiB fixture reserve')
        self.temp = tempfile.TemporaryDirectory(prefix='exact-source-history-', dir='/tmp')
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        git(self.root, 'init', '-q', str(self.repo))
        # Copy commits/trees and only the relevant snapshots as a small uncompressed
        # pack. No shared worktree, alternates, network fetch or production checkout.
        objects = {r.split()[0] for r in git(SOURCE, 'rev-list', '--objects', '--filter=blob:none', h.BASELINE).splitlines()}
        for rev in (h.BASELINE, h.PREIMAGE, h.LIVE, h.C2, h.ACTIVATED):
            objects.update(git(SOURCE, 'ls-tree', '-r', '--format=%(objectname)', rev).splitlines())
        for rev in git(SOURCE, 'rev-list', '--first-parent', h.BASELINE, '^c5dc5abb12aa1ac84ddbd12f141c6d4d8aca4de2').decode().splitlines():
            objects.update(git(SOURCE, 'ls-tree', '-r', '--format=%(objectname)', rev, '--', 'ops/deploy').splitlines())
        checked = git(SOURCE, 'cat-file', '--batch-check', data=b'\n'.join(sorted(objects)) + b'\n')
        objects = {row.split()[0] for row in checked.splitlines() if not row.endswith(b' missing')}
        pack = self.root / 'history.pack'
        with pack.open('wb') as out:
            p = subprocess.run(['git', '-C', str(SOURCE), 'pack-objects', '--stdout', '--compression=0'],
                               input=b'\n'.join(sorted(objects)) + b'\n', stdout=out, stderr=subprocess.PIPE,
                               timeout=60, env=git_environment())
            if p.returncode:
                raise RuntimeError('offline history pack failed: ' + p.stderr.decode())
        with pack.open('rb') as inp:
            subprocess.run(['git', '-C', str(self.repo), 'index-pack', '--stdin'], stdin=inp,
                           stdout=subprocess.DEVNULL, check=True, timeout=60)
        git(self.repo, 'config', 'user.name', 'Exact source fixture')
        git(self.repo, 'config', 'user.email', 'fixture@example.invalid')
        git(self.repo, 'checkout', '--detach', '-q', h.BASELINE)
        for path in h.INCIDENT_PATHS:
            dest = self.repo / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / path, dest)
        git(self.repo, 'add', '--', *sorted(h.INCIDENT_PATHS))
        git(self.repo, 'commit', '-qm', 'test: exact source handoff on reviewed baseline')
        self.target = git(self.repo, 'rev-parse', 'HEAD').decode().strip()

    def fixture(self):
        return Fixture(self)


class Fixture:
    def __init__(self, history):
        if shutil.disk_usage('/tmp').free < 5 * 1024**3:
            raise RuntimeError('less than 5 GiB fixture reserve')
        self.temp = tempfile.TemporaryDirectory(prefix='exact-source-incident-', dir='/tmp')
        self.root = Path(self.temp.name)
        self.repo, self.control = self.root / 'integration', self.root / 'control'
        self.target = history.target
        git(self.root, 'init', '-q', str(self.repo))
        for name in ('objects',):
            shutil.copytree(history.repo / '.git' / name, self.repo / '.git' / name, dirs_exist_ok=True)
        git(self.repo, 'config', 'user.name', 'Exact source fixture')
        git(self.repo, 'config', 'user.email', 'fixture@example.invalid')
        git(self.repo, 'remote', 'add', 'origin', h.b0.ORIGIN)
        git(self.repo, 'config', 'remote.origin.promisor', 'true')
        git(self.repo, 'config', 'remote.origin.partialclonefilter', 'blob:none')
        for host in ('github.com', 'gist.github.com'):
            git(self.repo, 'config', '--add', 'credential.https://' + host + '.helper', '')
            git(self.repo, 'config', '--add', 'credential.https://' + host + '.helper', '!/usr/bin/gh auth git-credential')
        git(self.repo, 'update-ref', 'refs/remotes/origin/main', self.target)
        git(self.repo, 'checkout', '--detach', '-q', h.PREIMAGE)
        for name, mode in h.PREIMAGE_MODES.items():
            (self.repo / name).chmod(mode)
        state = self.control / 'deploy-state'
        state.mkdir(parents=True)
        for name, value in h.MARKERS.items():
            (state / name).write_text(value + '\n')
        for name, (_, _, blob, mode) in h.INSTALLED.items():
            p = self.control / name
            p.write_bytes(git(self.repo, 'cat-file', 'blob', blob))
            p.chmod(mode)
        tree = git(self.repo, 'rev-parse', h.ACTIVATED + '^{tree}').decode().strip()
        (state / 'production-transition-b0-host.state').write_text(
            'version=production-transition-b0-host-state-v1\nstatus=terminal\n'
            f'trusted-base={h.ACTIVATED}\ntarget={h.ACTIVATED}\ntarget-tree={tree}\n')
        (state / 'production-transition-b0-host.state').chmod(0o600)
        for name in (*h.b0.LOCKS, *h.IDLE_LOCKS):
            (self.control / name).touch(mode=0o600)
        runtime = self.control / 'postgres-runtime-releases' / h.LIVE
        runtime.mkdir(parents=True)
        (runtime / 'READY').write_text(h.LIVE + '\n')
        (self.control / 'postgres-runtime-current').symlink_to(runtime)
        for name in ('auth-current', 'auth-pool', 'runtime'):
            (self.root / name).mkdir()
        generation = 'a' * 64
        accounts = [{'id': a, 'relativePath': f'snapshots/{generation}/{a}/auth.json'} for a in ('account-w', 'account-y')]
        for account in accounts:
            auth = self.root / 'auth-pool' / account['relativePath']
            auth.parent.mkdir(parents=True)
            auth.write_text('fixture-only\n')
            auth.chmod(0o440)
        pool = json.dumps({'schemaVersion': 1, 'snapshotId': generation, 'accounts': accounts}).encode()
        (self.root / 'auth-pool/current.json').write_bytes(pool)
        (self.root / 'auth-pool/current.approval.json').write_text(json.dumps(
            {'schemaVersion': 1, 'snapshotId': generation, 'poolManifestSha256': h.digest(pool),
             'controllerJobId': 'fixture-job', 'registryRootDir': str(self.root / 'auth-pool'),
             'reviewedAtEpoch': 1788580800, 'approvalSealSha256': 'b' * 64}))
        for name in ('current.json', 'current.approval.json'):
            (self.root / 'auth-pool' / name).chmod(0o440)
        (self.root / 'auth-current/auth.json').write_text('fixture-only\n')
        (self.root / 'auth-current/auth.json').chmod(0o440)
        for name in ('auth-current', 'auth-pool'):
            (self.root / name).chmod(0o750)
        # Real CLI state remains writable and unrelated to credential admission.
        for name in ('state_5.sqlite', 'state_5.sqlite-wal', 'logs', 'models_cache.json', 'skills', 'tmp'):
            (self.root / 'auth-current' / name).write_text('mutable fixture cache\n')
        (self.root / 'auth-pool/.snapshot.0r33fv').mkdir()
        (self.control / 'unrelated-worker').mkdir()
        (self.control / 'unrelated-worker/prompts').write_text('unrelated fixture prompt\n')
        release = self.root / 'runtime/frontend-releases' / h.LIVE
        for name in ('public', 'admin'):
            lane = release / name
            lane.mkdir(parents=True)
            (lane / 'release-sha.txt').write_text(h.LIVE + '\n')
            (self.root / 'runtime' / ('frontend-' + name + '-web')).symlink_to(lane)
        (release / 'READY').write_text(h.LIVE + '\n')
        for name in ('name', 'cursor'):
            (self.root / 'runtime' / ('auth-account-' + name)).write_text('w\n')
        (self.root / 'runtime/auth-account-cursor.install.lock').touch(mode=0o600)
        for sha in (h.PREIMAGE, h.LIVE):
            (state / ('otel-collector-config-' + sha + '.yml')).write_text('fixture collector\n')
        self.inert = ['daily-runner-recovery-20260721T054355Z.txt', 'deploy-37916c99.final.log',
            'deploy-37916c99.final.status', 'deploy-37916c99.retry.log', 'deploy-37916c99.retry.status',
            'previous-images-123456789abc.txt']
        for name in self.inert:
            (state / name).write_text('inert fixture archive\n')
        for name in ('operator-reconciled', 'postgres-runtime-release-rollback-' + h.LIVE + '.123',
                     'quarantine', 'quarantine-20260830T033949Z-09294b6b'):
            (state / name).mkdir()
            (state / name / 'unreadable-archive').mkdir(mode=0o000)
        (self.control / 'unrelated-worker.lock').touch()
        # Current primary has its own retained inode, while old archived marker
        # pairs and released scheduler holds have different, valid inodes.
        for name in (*h.MARKERS, 'production-transition-b0-host.state'):
            primary = state / name
            os.link(primary, state / (name + '.next.retired.' + h.digest(primary.read_bytes())))
        for name in ('backend.sha', 'production-transition-scheduler-hold.v2'):
            old = b'historical fixture record\n'
            retired = state / (name + '.retired.' + h.digest(old))
            retired.write_bytes(old)
            os.link(retired, state / (name + '.next.retired.' + h.digest(old)))
        self.unit = self.root / 'idle.service'
        self.unit.write_text('fixture unit\n')
        self.handoff = h.ExactSourceHandoff(self.root)
        self.handoff.target = self.target
        self.unit_active, self.running, self.restarts, self.auto_active = False, True, 0, False
        self.image_pins = False
        self.effects = []
        self.process_stub = patch.object(h.b0, 'subprocess', FixtureProcesses())
        self.process_stub.start()
        self.original_execute = h.b0.execute
        self.stub = patch.object(h.b0, 'execute', side_effect=self.execute)
        self.stub.start()

    def close(self):
        self.stub.stop()
        self.process_stub.stop()
        if (self.root / 'runtime-backup').exists():
            # A runtime cleanup stub/guard left this evidence: retain it in full.
            self.temp._finalizer.detach()
            print('Retained runtime fixture:', self.root)
        else:
            self.temp.cleanup()

    def execute(self, *args):
        if args[0] == '/usr/bin/sync':
            # File fsync remains real; avoid filesystem-wide flush of unrelated jobs.
            self.effects.append('syncfs')
            return b''
        if args[0] == '/usr/bin/systemctl':
            daily = args[2] == 'social-monitor-daily.service'
            active = 'active' if self.unit_active else ('failed' if daily else 'inactive')
            substate, result = ('failed', 'exit-code') if daily else ('dead', 'success')
            return (f'LoadState=loaded\nActiveState={active}\nSubState={substate}\nMainPID=0\nControlPID=0\nJob=\n'
                    f'Result={result}\nFragmentPath={self.unit}\nDropInPaths=\n').encode()
        if args[0] == '/usr/bin/ctr':
            return b''
        if args[0] == '/usr/bin/docker':
            if args[1] == 'image':
                return b'social-monitor-prod-rollback-rescue:fixture-pin\n' if self.image_pins else b''
            if args[1] == 'ps':
                return ''.join('social-monitor-prod-' + role + '-1\n' for role in (
                    'api', 'agent-runtime', 'ingestion-worker', 'intelligence-worker', 'delivery-service',
                    'event-relay', 'frontend', 'x-collector', 'rabbitmq', 'redis', 'otel-collector', 'caddy')).encode()
            if args[3] == '{{.RestartCount}}':
                return f'{self.restarts}\n0\n'.encode()
            return ''.join(f'id{i} image{i} {str(self.running).lower()} 123 none started 0 []\n' for i in range(12)).encode()
        if args[0] == '/usr/bin/gh':
            if 'branches/main' in args[-1]:
                return json.dumps({'protected': False, 'commit': {'sha': self.target, 'commit': {'tree': {'sha':
                    git(self.repo, 'rev-parse', self.target + '^{tree}').decode().strip()}}}}).encode()
            assert '?status=' in args[-1] and 'branch=' not in args[-1], 'all workflow runs must be terminal'
            return json.dumps({'total_count': int(self.auto_active)}).encode()
        if args[0] != '/usr/bin/git':
            raise AssertionError('unexpected effect: ' + args[0])
        return self.original_execute(*args)

    def review(self):
        self.plan = self.handoff.plan(self.target)
        self.approved = h.digest(h.canonical(self.plan))
        return self.plan
