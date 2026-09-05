#!/usr/bin/env python3
"""Bounded 30 -> exact main source staging. Never deploys or writes markers.

Run the independently reviewed copy with python3 -I -B. Its sibling historical
helper is authenticated before execution; neither helper is loaded from T.
"""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import types

BASELINE = '350ab58d30d443f29ccbf137debd204dfb60160d'
PREIMAGE = '30cba8fb89c8eaad18ee8c432f9bcbaef9d58040'
LIVE = '7e800e90d3295cc881e21a3e81b611fa57eb5b2a'
C2 = '77a24e22e8b56e4919ba06fd7ee844bac1dabc59'
ACTIVATED = 'c05591883683664d2a59158e4f4fba92fabb0ff4'
HELPER_SHA256 = '68210ef76f93c5d240c649a706bf9011f09d89023d1bdd3c955f11b2a08105a5'
INCIDENT_PATHS = frozenset('ops/deploy/' + p for p in (
    'production-exact-source-handoff.py', 'production-exact-source-handoff.test.py',
    'support/production-exact-source-handoff-fixture.py',
    'support/production-exact-source-handoff-host.sh',
    'README.md', 'production-transition-b0-bootstrap.test.sh'))
MARKERS = dict(zip(('backend.sha', 'frontend.sha', 'control.sha',
                   'postgres-pool-bootstrap.sha', 'production-transition-activated.sha'),
                  (LIVE, LIVE, LIVE, C2, ACTIVATED)))
PREIMAGE_MODES = {'ops/deploy/' + name: mode for name, mode in (
    ('production-runtime/reader-promotion-v2-production-canary.sh', 0o700),
    ('production-runtime/reader-promotion-v2-production-canary.test.sh', 0o700),
    ('rabbitmq-quorum-deploy-bridge-transition.test.sh', 0o600),
    ('runtime-source-permissions.test.py', 0o600))}
IDLE_LOCKS = ('daily-run-singleton.lock', 'rolling-run-singleton.lock',
    'daily-collection-singleton.lock', 'github-premidnight-capture-v1-singleton.lock',
    'reader-summary-scheduler-dispatch.lock', 'reader-summary-daily-c1-decision.lock',
    'worktree-cleanup.lock', 'deploy-state/postgres-pool-bootstrap.lock',
    'deploy-state/production-transition-review-consumption.lock')
TRUSTED_HOOKS = '/root/.config/git/hooks-777genius'
SAFE_GIT_CONFIG = {'core.hookspath': TRUSTED_HOOKS, 'remote.origin.promisor': 'true',
    'remote.origin.partialclonefilter': 'blob:none',
    **{'credential.https://' + host + '.helper': '!/usr/bin/gh auth git-credential'
       for host in ('github.com', 'gist.github.com')}}
# The C2 entrypoint differs from 7e; the other four retain these explicit 7e blobs.
INSTALLED = {
    'github-production-deploy.sh': (C2, 'social-monitor-production-deploy.sh', 'd245faeac28a99be7c22ecec3d330698059fba12', 0o755),
    'github-production-deploy-wrapper.sh': (LIVE, 'social-monitor-production-ssh-wrapper.sh', '910bcf8c508692b4cfac66ea22bc49579999014e', 0o755),
    'production-transition-b0-host-control.sh': (LIVE, 'production-transition-b0-host-control.sh', '56bf845458ec97f704a328906e51944d8c25835d', 0o644),
    'production-transition-canonical-lib.sh': (LIVE, 'production-transition-canonical-lib.sh', 'd690de57495de46a3782b0780ec870cf0e14af6a', 0o644),
    'production-transition-admission.sh': (LIVE, 'production-transition-admission.sh', '3bd4be4a82def9074f8b1ee4c8394992cf624850', 0o755),
}


def load_mechanics():
    path = Path(__file__).absolute().with_name('b0-controller-repair.py')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        info = os.fstat(stream.fileno())
        data = stream.read()
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or info.st_uid != os.geteuid() or info.st_mode & 0o022
                or hashlib.sha256(data).hexdigest() != HELPER_SHA256):
            raise RuntimeError('historical helper bytes/identity refused')
    module = types.ModuleType('exact_source_historical_mechanics')
    exec(compile(data, str(path), 'exec'), module.__dict__)
    return module


b0 = load_mechanics()
require, digest, canonical, regular = b0.require, b0.digest, b0.canonical, b0.regular


class ExactSourceHandoff(b0.ControllerRepair):
    def __init__(self, root=b0.ROOT):
        super().__init__(root, PREIMAGE, LIVE, '')
        require(b'GIT_NO_LAZY_FETCH' in Path('/usr/bin/git').read_bytes(), 'Git lacks no-lazy-fetch support')
        self.target = None
        self.expected = None
        self.recovery = None

    def hazards(self):
        require(not any(k.startswith('GIT_') for k in os.environ), 'Git environment overrides refused')
        # Inspect config before any status/checkout capable of invoking configured code.
        config = self.git('config', '--null', '--list').decode().split('\0')
        for row in filter(None, config):
            key, _, value = row.partition('\n')
            key = key.lower()
            if key in SAFE_GIT_CONFIG:
                # gh installs an empty helper reset before its exact helper.
                require(value == SAFE_GIT_CONFIG[key] or (key.startswith('credential.') and value == ''),
                        'unsafe Git configuration')
                continue
            require(not re.match(r'^(include|filter\.|diff\.|url\.|credential\.|http\.|'
                                 r'gpg\.|merge\.|submodule\.|maintenance\.|gc\.|'
                                 r'core\.(hookspath|fsmonitor|sshcommand|worktree|attributesfile|autocrlf|eol)|'
                                 r'remote\..*\.(promisor|partialclonefilter|uploadpack)|extensions\.)', key),
                    'unsafe Git configuration')
        require(self.git('remote', 'get-url', '--all', 'origin').strip() == b0.ORIGIN.encode(), 'origin differs')
        gitdir = self.repo / '.git'
        for p in gitdir.rglob('*'):
            require(not p.is_symlink() and not p.name.endswith('.lock'), 'Git symlink/lock hazard')
        for name in ('objects/info/alternates', 'shallow', 'worktrees', 'config.worktree', 'info/attributes'):
            require(not os.path.lexists(gitdir / name), 'unsupported Git storage/worktree')
        super().hazards()
        # Bind configuration and harmless nonexecuted hooks, without disabling them.
        hooks = Path(self.git('rev-parse', '--git-path', 'hooks').decode().strip())
        hooks = hooks if hooks.is_absolute() else self.repo / hooks
        self.configuration = {'sha256': digest(self.git('config', '--null', '--show-origin', '--list')),
                              'hooks_directory': self.directory(hooks), 'hooks': {}}
        for path in sorted(hooks.iterdir()):
            require(path.name in ('pre-commit', 'pre-push') or path.name.endswith('.sample'),
                    'unreviewed Git hook')
            data, identity = regular(path)
            self.configuration['hooks'][path.name] = [digest(data), identity]
        for path in (self.repo, gitdir):
            self.directory(path)
        regular(gitdir / 'config')
        regular(gitdir / 'index')
        regular(gitdir / 'HEAD')
        require(self.git('config', '--get', 'core.filemode').strip() == b'true', 'Git mode checking required')
        require(not self.git('ls-files', '--others', '--ignored', '--exclude-standard').strip(),
                'ignored worktree data requires investigation')
        self.reserve()

    def reserve(self):
        for path in (self.repo, self.control):
            v = os.statvfs(path)
            require(v.f_bavail * v.f_frsize >= 5 * 1024**3, 'less than 5 GiB reserve')

    @staticmethod
    def directory(path):
        s = path.lstat()
        require(path.resolve() == path and stat.S_ISDIR(s.st_mode)
                and s.st_uid == os.geteuid() and not s.st_mode & 0o022, 'unsafe directory')
        return [s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid]

    def lease(self, target):
        require(self.remote() == target and self.git('rev-parse', 'origin/main').strip().decode() == target,
                'main lease drift')
        # Read-only GitHub observation. Check every nonterminal status, including queued approval.
        for status in ('queued', 'in_progress', 'waiting', 'pending', 'requested'):
            value = json.loads(b0.execute('/usr/bin/gh', 'api',
                'repos/777genius/social-monitor/actions/workflows/production-deploy.yml/runs'
                f'?status={status}&per_page=1'))
            require(value['total_count'] == 0, 'GitHub auto-deploy is not terminal')

    def remote(self):
        require(os.environ.get('GH_HOST', 'github.com') == 'github.com', 'GitHub host override refused')
        branch = json.loads(b0.execute('/usr/bin/gh', 'api', 'repos/777genius/social-monitor/branches/main'))
        sha = branch['commit']['sha']
        require(re.fullmatch('[0-9a-f]{40}', sha) and sha == self.target, 'main lease drift')
        require(branch['commit']['commit']['tree']['sha'] == self.tree(sha), 'main/tree drift')
        # The observed branch is protected:false. Authority is independent root
        # review of exact SHA/tree/plan, never an invented branch-protection claim.
        return sha

    def units(self):
        result = {}
        for unit in ('daily', 'weekly', 'rolling', 'github-premidnight-capture-v1'):
            name = 'social-monitor-' + unit + '.service'
            raw = b0.execute('/usr/bin/systemctl', 'show', name, '--property=LoadState,ActiveState,SubState,MainPID,ControlPID,Job,Result,FragmentPath,DropInPaths')
            fields = dict(line.split('=', 1) for line in raw.decode().splitlines())
            require(fields['LoadState'] == 'loaded' and fields['ActiveState'] in ('inactive', 'failed')
                    and fields['SubState'] in ('dead', 'failed') and fields['MainPID'] == '0'
                    and fields['ControlPID'] == '0' and fields['Job'] in ('', '0'), 'active or uncertain unit')
            files = {}
            for path in [fields['FragmentPath'], *fields['DropInPaths'].split()]:
                data, identity = regular(Path(path))
                files[path] = [digest(data), identity]
            result[name] = [fields, files]
        return result

    @contextlib.contextmanager
    def locked(self):
        self.daily_probe()  # Daily priority before taking host/deploy/PG admission locks.
        with super().locked(), contextlib.ExitStack() as stack:
            for path in [*(self.control / name for name in IDLE_LOCKS),
                         self.root / 'runtime/auth-account-cursor.install.lock']:
                if os.path.lexists(path):
                    _, identity = regular(path)
                    stream = stack.enter_context(os.fdopen(os.open(path, os.O_RDWR | os.O_NOFOLLOW), 'r+b'))
                    require([os.fstat(stream.fileno()).st_dev, os.fstat(stream.fileno()).st_ino] == identity[:2],
                            'coordination lock replaced')
                    b0.fcntl.flock(stream, b0.fcntl.LOCK_EX | b0.fcntl.LOCK_NB)
                    require(path.lstat().st_ino == identity[1], 'coordination lock replaced')
            self.units()
            if self.recovery:
                self.check_run(self.target, self.recovery)
            yield

    def snapshot(self, path, result):
        # Explicit paths only: never traverse CLI homes, control caches or workers.
        key = str(path.relative_to(self.root))
        for parent in path.parents:
            if parent == self.root:
                break
            self.directory(parent)
        if path.is_dir() and not path.is_symlink():
            result[key] = self.directory(path)
            return None
        data, identity = regular(path)
        result[key] = [digest(data), identity]
        return data

    def marker_snapshot(self, path, result):
        # Retired records describe THEIR inode/content, not today's primary inode.
        # Match exactly the marker protocol's four possible link names.
        match = re.fullmatch(r'(.+?)(?:\.next)?\.retired\.([0-9a-f]{64})', path.name)
        base = match[1] if match else path.name
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
            before = os.fstat(stream.fileno())
            data = stream.read()
            sha = digest(data)
            require(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
                    and not before.st_mode & 0o022 and before.st_nlink in (1, 2), 'unsafe state record')
            require(not match or match[2] == sha, 'retired record digest differs')
            require(not os.path.lexists(path.with_name(base + '.next')), 'unfinished marker')
            names = (base, base + '.retired.' + sha, base + '.next.retired.' + sha)
            links = [path.with_name(n).lstat() for n in names if os.path.lexists(path.with_name(n))]
            require(sum((s.st_dev, s.st_ino) == (before.st_dev, before.st_ino) for s in links)
                    == before.st_nlink, 'unaccounted state hardlink')
            identity = lambda s: [s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns,
                                  s.st_ctime_ns, s.st_uid, s.st_gid, s.st_nlink]
            require(identity(before) == identity(os.fstat(stream.fileno())) == identity(path.lstat()),
                    'state record replaced')
        result[str(path.relative_to(self.root))] = [sha, identity(before)]
        return data

    def bound_link(self, path, destination, result):
        require(path.is_symlink() and path.resolve(strict=True) == destination, 'runtime link drift')
        s = path.lstat()
        result[str(path.relative_to(self.root))] = [os.readlink(path),
            [s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_ctime_ns]]
        self.snapshot(destination, result)

    def protected(self):
        state = self.control / 'deploy-state'
        result = {}
        for name, value in MARKERS.items():
            require(self.marker_snapshot(state / name, result) == (value + '\n').encode(), 'marker drift')
        for name, (commit, source, blob, mode) in INSTALLED.items():
            require(self.entry(commit, 'ops/deploy/' + source)[1] == blob, 'installed mapping changed')
            data = self.snapshot(self.control / name, result)
            require(data == self.git('cat-file', 'blob', blob)
                    and stat.S_IMODE((self.control / name).lstat().st_mode) == mode,
                    'installed control differs from explicit trusted blob/mode')
        record = self.marker_snapshot(state / 'production-transition-b0-host.state', result)
        require(b'\nstatus=terminal\n' in record, 'transition is not terminal')
        marker_names = set(b0.STATE_FILES) | {'production-transition-scheduler-hold.v2'}
        self.snapshot(state / ('otel-collector-config-' + PREIMAGE + '.yml'), result)
        locks = {*b0.LOCKS, *IDLE_LOCKS}
        for path in sorted(state.iterdir()):
            name = path.name
            base = re.sub(r'(?:\.next)?\.retired\.[0-9a-f]{64}$', '', name)
            if base in marker_names:
                require(name != 'production-transition-scheduler-hold.v2', 'active scheduler hold')
                if base == name:
                    self.marker_snapshot(path, result)
                continue  # Historical retired records are inert; primary links were checked above.
            if 'deploy-state/' + name not in locks:
                require(not re.match(r'(backend-image-(rescue|pin)|production-transition|'
                        r'\.postgres-pool-atomic-bootstrap|postgres-pool-bootstrap|'
                        r'(backend|frontend|control)\.sha|rescue|pin)(?:[-.]|$)', name),
                        'outstanding rescue/pin/unknown transition state')
        # Inspect names at the coordination boundary, never recursively scan control.
        for path in self.control.iterdir():
            if path.name.startswith('production-exact-source-handoff-'):
                require(path == self.run_path(self.target), 'another incident run requires investigation')
            if path.name not in locks:
                require(not re.match(r'(backend-image-(rescue|pin)|rescue|pin|production-deploy|'
                        r'(daily|rolling)-run.*lock)(?:[-.]|$)', path.name), 'outstanding rescue/pin/lock state')
        for name in (*b0.LOCKS, *IDLE_LOCKS):
            path = self.control / name
            if os.path.lexists(path):
                self.snapshot(path, result)
        runtime = self.control / 'postgres-runtime-releases' / LIVE
        self.bound_link(self.control / 'postgres-runtime-current', runtime, result)
        require(self.snapshot(runtime / 'READY', result) == (LIVE + '\n').encode(), 'runtime READY drift')
        self.auth_snapshot(result)
        release = self.root / 'runtime/frontend-releases' / LIVE
        self.snapshot(release, result)
        require(self.snapshot(release / 'READY', result) == (LIVE + '\n').encode(), 'frontend READY drift')
        for lane in ('public', 'admin'):
            self.bound_link(self.root / ('runtime/frontend-' + lane + '-web'), release / lane, result)
            require(self.snapshot(release / lane / 'release-sha.txt', result) == (LIVE + '\n').encode(),
                    'frontend release drift')
        result['units'] = self.units()
        result['containers'] = self.runtime_identity()
        return result

    def auth_snapshot(self, result):
        pool_root = self.root / 'auth-pool'
        for path in (pool_root, self.root / 'auth-current'):
            self.snapshot(path, result)
        self.snapshot(self.root / 'auth-current/auth.json', result)
        pool_bytes = self.snapshot(pool_root / 'current.json', result)
        pool = json.loads(pool_bytes)
        approval = json.loads(self.snapshot(pool_root / 'current.approval.json', result))
        require(pool['schemaVersion'] == 1 and re.fullmatch('[0-9a-f]{64}', pool['snapshotId'])
                and sorted(a['id'] for a in pool['accounts']) == ['account-w', 'account-y'], 'auth snapshot account drift')
        require(approval['schemaVersion'] == 1 and approval['snapshotId'] == pool['snapshotId']
                and approval['poolManifestSha256'] == digest(pool_bytes)
                and re.fullmatch('[0-9a-f]{64}', approval['approvalSealSha256']),
                'auth approval differs')
        for account in pool['accounts']:
            expected = 'snapshots/' + pool['snapshotId'] + '/' + account['id'] + '/auth.json'
            require(account['relativePath'] == expected, 'unsafe auth snapshot path')
            self.snapshot(pool_root / expected, result)
        for name in ('auth-account-name', 'auth-account-cursor', 'auth-account-cursor.install.lock'):
            path = self.root / 'runtime' / name
            if os.path.lexists(path):
                self.snapshot(path, result)
        require(not any(os.path.lexists(self.root / 'runtime' / name) for name in
                ('auth-account-changed', 'auth-account-cursor.lock')), 'unfinished auth refresh')

    def runtime_identity(self):
        names = b0.execute('/usr/bin/docker', 'ps', '--all', '--filter',
                           'name=social-monitor-', '--format', '{{.Names}}').decode().splitlines()
        expected = {'social-monitor-prod-' + role + '-1' for role in (
            'api', 'agent-runtime', 'ingestion-worker', 'intelligence-worker', 'delivery-service',
            'event-relay', 'frontend', 'x-collector', 'rabbitmq', 'redis', 'otel-collector', 'caddy')}
        require(expected <= set(names) and all(name in expected or not re.search(
            r'(social-monitor-prod-|daily|rolling|rescue|pin)', name) for name in names),
            'unknown production container/run/pin')
        images = b0.execute('/usr/bin/docker', 'image', 'ls', '--format', '{{.Repository}}:{{.Tag}}')
        require(not any(row.startswith(b'social-monitor-prod-rollback-rescue:') for row in images.splitlines()),
                'outstanding rescue image pins')
        tasks = b0.execute('/usr/bin/ctr', '-n', 'moby', 'tasks', 'list', '--quiet').decode().splitlines()
        require(not any('social-monitor' in task for task in tasks), 'outstanding containerd work')
        counts = b0.execute('/usr/bin/docker', 'inspect', '--format', '{{.RestartCount}}',
                            'social-monitor-prod-api-1', 'social-monitor-prod-agent-runtime-1')
        require(counts.splitlines() == [b'0', b'0'], 'API/agent restart drift')
        return super().runtime_identity()

    def tree(self, commit):
        return self.git('rev-parse', commit + '^{tree}').decode().strip()

    def entry(self, commit, path):
        row = self.git('ls-tree', commit, '--', path).decode().strip()
        if not row:
            return None
        mode, kind, blob, actual = row.replace('\t', ' ').split()
        require(kind == 'blob' and mode in ('100644', '100755') and actual == path, 'unsafe source mode/path')
        return [mode, blob, digest(self.git('cat-file', 'blob', blob))]

    def delta(self, target):
        self.git('merge-base', '--is-ancestor', BASELINE, target)
        self.git('merge-base', '--is-ancestor', PREIMAGE, target)
        paths = self.git('diff', '--name-only', '--no-renames', BASELINE, target).decode().splitlines()
        require(set(paths) <= INCIDENT_PATHS, 'additional scope beyond reviewed baseline')
        for path in paths:
            old, new = self.entry(BASELINE, path), self.entry(target, path)
            require(new is not None and new[0] == (old[0] if old else '100644'), 'incident deletion/mode')
        runner = 'ops/deploy/production-transition-b0-bootstrap.test.sh'
        hook = b'python3 -B \"$SCRIPT_DIR/production-exact-source-handoff.test.py\"\n'
        baseline_runner = self.git('show', BASELINE + ':' + runner)
        require(self.git('show', target + ':' + runner) == baseline_runner.replace(
            b'python3 -B \"$SCRIPT_DIR/b0-controller-repair.test.py\"\n',
            b'python3 -B \"$SCRIPT_DIR/b0-controller-repair.test.py\"\n' + hook), 'runner hook differs')
        require(self.git('show', target + ':ops/deploy/README.md').startswith(
            self.git('show', BASELINE + ':ops/deploy/README.md')), 'existing deployment docs changed')
        tool = 'ops/deploy/production-exact-source-handoff.py'
        tool_entry = self.entry(target, tool)
        require(tool_entry and tool_entry[0] == '100644'
                and digest(regular(Path(__file__).absolute())[0]) == tool_entry[2],
                'target operator differs from independently reviewed bytes')
        entries = {}
        for path in self.git('diff', '--name-only', '--no-renames', PREIMAGE, target).decode().splitlines():
            old, new = self.entry(PREIMAGE, path), self.entry(target, path)
            require(new is not None and new[0] == (old[0] if old else '100644'), 'source deletion/mode')
            entries[path] = [old, new]
        fix = 'ops/deploy/backend-image-rescue-lib.sh'
        require(entries[fix][0][:2] == ['100644', '1faa90315832163057ae91a4140c6ae6c43d68bd']
                and entries[fix][1][:2] == ['100644', 'dae56a213d9bd84a2028ce41013c458eb69e5715'], 'wrong collector fix')
        return entries

    def plan(self, target):
        self.target = target
        self.hazards()
        require(re.fullmatch('[0-9a-f]{40}', target), 'full target SHA required')
        self.lease(target)
        self.available_objects(target)
        plan = {'version': '30-exact-source-v1', 'preimage': PREIMAGE, 'target': target,
                'preimage_tree': self.tree(PREIMAGE), 'baseline': BASELINE, 'baseline_tree': self.tree(BASELINE),
                'target_tree': self.tree(target), 'entries': self.delta(target),
                'preimage_modes': dict(PREIMAGE_MODES),
                'helper_sha256': HELPER_SHA256, 'git_directory_identity': self.git_directory_identity(),
                'git_configuration': self.configuration,
                'protected': self.protected()}
        self.verify_checkout(plan, 0)
        self.expected = plan
        return plan

    def verify_checkout(self, plan, revision=1):
        self.hazards()
        require(self.configuration == plan['git_configuration'], 'Git configuration drift')
        require(plan['target_tree'] == self.tree(plan['target']) and plan['entries'] == self.delta(plan['target']),
                'reviewed tree/blob drift')
        expected = plan['target_tree'] if revision else plan['preimage_tree']
        require(self.git('write-tree').strip().decode() == expected, 'index tree differs')
        require(self.git_directory_identity() == plan['git_directory_identity'], 'Git directory replaced')
        require(self.git('rev-parse', 'HEAD').strip().decode() == (plan['target'] if revision else PREIMAGE),
                'checkout HEAD differs')
        require(not self.git('status', '--porcelain=v1', '--untracked-files=all').strip(), 'checkout is dirty')
        require(plan['preimage_modes'] == PREIMAGE_MODES, 'preimage modes differ')
        for name, versions in plan['entries'].items():
            expected = versions[revision]
            path = self.repo / name
            require(path.resolve() == path, 'source symlink traversal')
            if expected is None:
                require(not os.path.lexists(path), 'new source path already exists')
                continue
            data, identity = regular(path)
            mode = int(expected[0][-3:], 8) if revision else PREIMAGE_MODES.get(name, int(expected[0][-3:], 8))
            require(digest(data) == expected[2] and stat.S_IMODE(identity[2]) == mode,
                    'checkout bytes/mode differ from reviewed blob')
        require(self.protected() == plan['protected'], 'protected state changed')
        if not (revision == 0 and self.recovery):
            self.lease(plan['target'])

    def available_objects(self, target):
        objects = self.git('ls-tree', '-r', '-t', '--format=%(objectname)', target)
        rows = self.git('cat-file', '--batch-check', data=objects).splitlines()
        require(len(rows) == len(objects.splitlines()) and all(len(row.split()) == 3
                and row.split()[1] in (b'blob', b'tree') for row in rows), 'missing target objects')

    def git(self, *args, data=None):
        require(not any(k.startswith('GIT_') for k in os.environ), 'Git environment overrides refused')
        if args[0] == 'merge':
            require(self.expected is not None, 'missing prepared plan')
            # Prepare and backups must survive power loss before the first source write.
            b0.execute('/usr/bin/sync', '--file-system', str(self.control))
            self.verify_checkout(self.expected, 0)
            self.available_objects(self.expected['target'])
        previous = os.umask(0o022) if args[0] in ('merge', 'restore') else None
        try:
            result = b0.subprocess.run(['/usr/bin/git', '-C', str(self.repo), *args], input=data,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120, check=False,
                env=dict(os.environ, GIT_NO_LAZY_FETCH='1'))
            require(result.returncode == 0, 'local Git command refused')
            return result.stdout
        finally:
            if previous is not None:
                os.umask(previous)

    def run_path(self, target):
        require(target and re.fullmatch('[0-9a-f]{40}', target), 'full target SHA required')
        return self.control / ('production-exact-source-handoff-' + target)

    def check_run(self, target, approved):
        self.target = target
        run = self.run_path(target)
        self.directory(run)
        require(not os.path.lexists(run / 'ordinary-handoff'), 'handoff forbids source rollback/replay')
        require(not os.path.lexists(run / 'rolled-back'), 'rolled-back run is terminal')
        data, _ = regular(run / 'plan.json')
        require(digest(data) == approved, 'reviewed plan drifted')
        plan = json.loads(data)
        require(plan['preimage'] == PREIMAGE and plan['target'] == target
                and plan['baseline'] == BASELINE and plan['preimage_modes'] == PREIMAGE_MODES
                and plan['entries'] == self.delta(target)
                and plan['target_tree'] == self.tree(target), 'reviewed source identity differs')
        require(regular(run / 'prepared')[0] == canonical({'plan_sha256': approved}), 'prepare receipt differs')
        names = {'plan.json', 'index.backup', 'prepared', 'control-repaired', 'rolling-back'}
        for number, versions in enumerate(plan['entries'].values()):
            if versions[0]:
                name = f'old-blob-{number}'
                names.add(name)
                require(digest(regular(run / name)[0]) == versions[0][2], 'source backup differs')
        regular(run / 'index.backup')
        require({p.name for p in run.iterdir()} <= names, 'unknown incident run data/lock')
        untracked = set(self.git('ls-files', '--others', '--exclude-standard').decode().splitlines())
        require(untracked <= {p for p, v in plan['entries'].items() if v[0] is None},
                'untracked data forbids recovery')

    def rollback(self, target, approved):
        self.target = target
        self.hazards()
        self.recovery = approved
        with self.locked():
            run = self.run_path(target)
            plan = json.loads(regular(run / 'plan.json')[0])
            rollback_receipt = canonical({'plan_sha256': approved})
            resuming = os.path.lexists(run / 'rolling-back')
            if resuming:
                require(regular(run / 'rolling-back')[0] == rollback_receipt, 'rollback receipt differs')
            require(self.protected() == plan['protected'], 'protected state drift forbids rollback')
            require(self.configuration == plan['git_configuration'], 'Git configuration drift')
            require(self.git_directory_identity() == plan['git_directory_identity'], 'Git directory replaced')
            require(self.git('rev-parse', 'HEAD').strip().decode() in (PREIMAGE, target), 'unknown HEAD')
            for args in (('diff', '--name-only', '--no-renames', PREIMAGE),
                         ('diff', '--cached', '--name-only', '--no-renames', PREIMAGE)):
                require(set(self.git(*args).decode().splitlines()) <= set(plan['entries']),
                        'unrelated edits forbid rollback')
            # Validate the entire mixed checkout before the first rollback write.
            for name, versions in plan['entries'].items():
                path = self.repo / name
                require(path.resolve() == path, 'source symlink traversal')
                if os.path.lexists(path):
                    data, identity = regular(path)
                    require(any(v and digest(data) == v[2] and stat.S_IMODE(identity[2]) in
                            ({PREIMAGE_MODES.get(name, int(v[0][-3:], 8))} |
                             ({int(v[0][-3:], 8)} if resuming else set()) if i == 0 else {int(v[0][-3:], 8)})
                            for i, v in enumerate(versions)), 'unknown bytes/mode in interrupted staging')
                else:
                    require(versions[0] is None, 'missing historical source')
                indexed = self.git('ls-files', '--stage', '--', name).decode().strip()
                require((not indexed and versions[0] is None) or any(v and indexed ==
                        f'{v[0]} {v[1]} 0\t{name}' for v in versions), 'unknown index entry')
            if not resuming:
                b0.durable(run / 'rolling-back', rollback_receipt)
            b0.execute('/usr/bin/sync', '--file-system', str(self.control))
            for name, versions in plan['entries'].items():
                if versions[0]:
                    self.git('restore', '--source=' + PREIMAGE, '--staged', '--worktree', '--', name)
                    # Git restores only its executable bit. Restore each reviewed
                    # restrictive preimage permission without widening other paths.
                    if name in PREIMAGE_MODES:
                        (self.repo / name).chmod(PREIMAGE_MODES[name])
                else:
                    self.git('update-index', '--force-remove', '--', name)
                    if (self.repo / name).exists():
                        (self.repo / name).unlink()
            self.git('checkout', '--detach', PREIMAGE)
            self.seal_checkout(plan, revision=0)
            b0.durable(self.run_path(target) / 'rolled-back', canonical({'preimage': PREIMAGE}))

    def handoff(self, target, approved):
        self.target = target
        self.hazards()
        self.recovery = approved
        super().handoff(target, approved)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('inspect', 'apply', 'rollback', 'handoff'))
    parser.add_argument('target')
    parser.add_argument('--approved-plan-sha256', default='')
    args = parser.parse_args()
    require(os.geteuid() == 0 and Path('/etc/machine-id').read_text().strip() == b0.MACHINE,
            'operator is pinned to the production machine')
    transaction = ExactSourceHandoff()
    transaction.target = args.target
    if args.action == 'inspect':
        with transaction.locked():
            plan = transaction.plan(args.target)
        print(canonical({'plan': plan, 'plan_sha256': digest(canonical(plan))}).decode(), end='')
    else:
        require(re.fullmatch('[0-9a-f]{64}', args.approved_plan_sha256), 'reviewed plan SHA256 required')
        getattr(transaction, args.action)(args.target, args.approved_plan_sha256)
        print(canonical({'action': args.action, 'target': args.target, 'application_deployed': False}).decode(), end='')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        # Do not surface subprocess output, JSON payloads, credentials or arbitrary paths.
        print('exact-source-handoff refused; inspect local state with the operator', file=sys.stderr)
        sys.exit(1)
