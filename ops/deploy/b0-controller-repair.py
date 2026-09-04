#!/usr/bin/env python3
"""One-incident operator recovery; never deploys an application or writes markers.

Install/review this exact script independently of the broken controller. Review
the inspect output, then bind apply to its SHA256. Only the protected-main
control delta below is admitted. A failed/interrupted apply is NOT success:
rollback accepts only recognizable old/new path and index states. Unknown
bytes or an outstanding Git lock require operator investigation, not reset.
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ROOT = Path('/var/data/social-monitor')
MACHINE = 'be0aad971ea647fab370acd110b469b7'
PREIMAGE = '8c402ecadff1db34a9d5991b777a5eb8032282de'
LIVE = 'c05591883683664d2a59158e4f4fba92fabb0ff4'
ORIGIN = 'https://github.com/777genius/social-monitor.git'
CONTROLLER = 'ops/deploy/deploy-control-lib.sh'
CONTROLLER_SHA256 = '3caf2f61ef68ef9697d4e2d5dd3eb057abbcc201942670d4e81fba5ab89f20ad'
ALLOWED = frozenset('ops/deploy/' + name for name in (
    'deploy-control-lib.sh', 'production-transition-b0-bootstrap.test.sh',
    'production-transition-bridge.manifest', 'production-transition-review.statement',
    'production-transition-review.statement.sig',
    'rabbitmq-quorum-deploy-bridge-transition.test.sh',
    'b0-controller-repair.py', 'b0-controller-repair.test.py'))
MARKERS = ('backend.sha', 'frontend.sha', 'control.sha',
           'postgres-pool-bootstrap.sha', 'production-transition-activated.sha')
STATE_FILES = (*MARKERS, 'production-transition-b0-host.state',
               'production-transition-review-consumption.v2')
CONTROLS = ('github-production-deploy.sh', 'github-production-deploy-wrapper.sh',
            'production-transition-b0-host-control.sh',
            'production-transition-canonical-lib.sh', 'production-transition-admission.sh')
LOCKS = ('deploy-state/production-transition-b0-host.lock',
         'production-deploy.lock', 'daily-run.lock')


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def execute(*args: str) -> bytes:
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=120, check=False)
    require(result.returncode == 0, f'command failed: {args[0]} {args[1:3]}')
    return result.stdout


def regular(path: Path) -> tuple[bytes, list[int]]:
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                and before.st_uid == os.geteuid() and not before.st_mode & 0o022,
                f'unsafe file: {path}')
        data = stream.read()
        after = os.fstat(stream.fileno())
        identity = lambda s: [s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns]
        require(identity(before) == identity(after) == identity(path.lstat()),
                f'file changed during read: {path}')
        return data, identity(after)


def durable(path: Path, data: bytes) -> None:
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


class ControllerRepair:
    """Scope and audit of this incident, not a general deployment authority."""

    def __init__(self, root: Path, preimage: str, live: str, controller_hash: str):
        self.root, self.repo, self.control = root, root / 'integration', root / 'control'
        self.preimage, self.live, self.controller_hash = preimage, live, controller_hash

    def git(self, *args: str) -> bytes:
        return execute('/usr/bin/git', '-C', str(self.repo), *args)

    def remote(self) -> str:
        lines = self.git('ls-remote', '--exit-code', 'origin', 'refs/heads/main').decode().splitlines()
        require(len(lines) == 1 and lines[0].endswith('\trefs/heads/main'), 'ambiguous main lease')
        return lines[0].split()[0]

    def hazards(self) -> None:
        require(self.repo.resolve() == self.repo and (self.repo / '.git').is_dir()
                and not (self.repo / '.git').is_symlink(), 'unsafe integration/common directory')
        require(self.git('rev-parse', '--git-common-dir').strip() == b'.git', 'integration is not common Git root')
        require(not (self.repo / '.git/HEAD').read_text().startswith('ref:'), 'integration must be detached')
        for name in ('index.lock', 'HEAD.lock', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD',
                     'rebase-merge', 'rebase-apply', 'sequencer', 'info/grafts', 'info/sparse-checkout'):
            require(not os.path.lexists(self.repo / '.git' / name), f'unfinished/unsafe Git state: {name}')
        require(not self.git('for-each-ref', '--format=%(refname)', 'refs/replace').strip(), 'replace refs refused')
        hooks = self.git('rev-parse', '--git-path', 'hooks').decode().strip()
        hooks_path = Path(hooks) if Path(hooks).is_absolute() else self.repo / hooks
        # Do not disable or bypass installed hooks. Refuse ones this recovery
        # could execute, including reference-transaction and fsmonitor hooks.
        for name in ('post-merge', 'post-checkout', 'reference-transaction', 'post-index-change'):
            require(not os.path.lexists(hooks_path / name), f'recovery would invoke hook: {name}')
        for key in ('core.fsmonitor', 'core.sparseCheckout', 'core.splitIndex'):
            value = subprocess.run(['/usr/bin/git', '-C', str(self.repo), 'config', '--get', key],
                                   stdout=subprocess.PIPE, check=False).stdout.strip()
            require(value in (b'', b'false'), f'unsupported Git setting: {key}')
        require(not self._has_filters(), 'Git content filters refused')

    def _has_filters(self) -> bool:
        return subprocess.run(['/usr/bin/git', '-C', str(self.repo), 'config', '--get-regexp',
                               r'^filter\..*\.(clean|smudge|process)$'], stdout=subprocess.DEVNULL,
                              check=False).returncode == 0

    @contextlib.contextmanager
    def locked(self):
        with contextlib.ExitStack() as stack:
            for name in LOCKS:
                if name == 'daily-run.lock':
                    self.daily_probe()
                path = self.control / name
                _, identity = regular(path)
                stream = stack.enter_context(os.fdopen(os.open(path, os.O_RDWR | os.O_NOFOLLOW), 'r+b'))
                info = os.fstat(stream.fileno())
                require([info.st_dev, info.st_ino] == identity[:2], 'lock inode changed')
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                require(path.lstat().st_ino == info.st_ino, 'lock replaced')
            self.daily_probe()
            yield

    def daily_probe(self) -> None:
        path = self.control / 'daily-run-singleton.lock'
        _, identity = regular(path)
        with os.fdopen(os.open(path, os.O_RDWR | os.O_NOFOLLOW), 'r+b') as stream:
            info = os.fstat(stream.fileno())
            require([info.st_dev, info.st_ino] == identity[:2], 'daily lock changed')
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def protected(self) -> dict:
        result = {}
        for name in STATE_FILES:
            path = self.control / 'deploy-state' / name
            data, identity = regular(path)
            if name in MARKERS:
                require(data == (self.live + '\n').encode(), f'live marker drift: {name}')
            result[str(path.relative_to(self.root))] = [digest(data), identity]
        for name in CONTROLS:
            data, identity = regular(self.control / name)
            result['control/' + name] = [digest(data), identity]
        for name in ('production-transition-scheduler-hold.v2', 'production-transition-b0-host.state.next'):
            require(not os.path.lexists(self.control / 'deploy-state' / name), f'incomplete transition: {name}')
        link = self.control / 'postgres-runtime-current'
        require(link.is_symlink(), 'runtime current is not a symlink')
        result['runtime-link'] = [os.readlink(link), link.lstat().st_ino]
        require(link.resolve() == self.control / 'postgres-runtime-releases' / self.live,
                'runtime link left live release')
        data, identity = regular(link / 'READY')
        require(data == (self.live + '\n').encode(), 'runtime READY drift')
        result['runtime-ready'] = [digest(data), identity]
        result['containers'] = self.runtime_identity()
        return result

    def runtime_identity(self) -> str:
        names = ['social-monitor-prod-' + role + '-1' for role in (
            'api', 'agent-runtime', 'ingestion-worker', 'intelligence-worker',
            'delivery-service', 'event-relay', 'frontend', 'x-collector')]
        return digest(execute('/usr/bin/docker', 'inspect', '--format',
                              '{{.Id}} {{.Image}} {{.State.StartedAt}} {{.RestartCount}}', *names))

    def plan(self, target: str) -> dict:
        require(re.fullmatch('[0-9a-f]{40}', target) is not None, 'full target SHA required')
        self.hazards()
        require(self.git('rev-parse', 'HEAD').decode().strip() == self.preimage, 'preimage HEAD differs')
        require(not self.git('status', '--porcelain=v1').strip(), 'integration is dirty')
        require(self.remote() == target, 'target is not exact protected main')
        self.git('merge-base', '--is-ancestor', self.preimage, target)
        paths = self.git('diff', '--name-only', '--no-renames', self.preimage, target).decode().splitlines()
        require(CONTROLLER in paths and set(paths) <= ALLOWED, 'delta is not this control-only repair')
        require(digest(self.git('show', target + ':' + CONTROLLER)) == self.controller_hash, 'wrong controller fix')
        entries = {}
        for name in paths:
            versions = []
            for commit in (self.preimage, target):
                row = self.git('ls-tree', commit, '--', name).decode().strip()
                if not row:
                    versions.append(None)
                    continue
                mode, kind, tail = row.split(' ', 2)
                blob, actual = tail.split('\t')
                require(kind == 'blob' and mode in ('100644', '100755') and actual == name,
                        'non-regular repair path')
                versions.append([mode, blob, digest(self.git('cat-file', 'blob', blob))])
            require(versions[1] is not None, 'repair must not remove files')
            entries[name] = versions
        return {'version': 1, 'preimage': self.preimage, 'target': target,
                'target_tree': self.git('rev-parse', target + '^{tree}').decode().strip(),
                'delta_sha256': digest(self.git('diff', '--binary', '--full-index', self.preimage, target)),
                'entries': entries, 'protected': self.protected(),
                'git_directory_inode': (self.repo / '.git').stat().st_ino}

    def run_path(self, target: str) -> Path:
        require(re.fullmatch('[0-9a-f]{40}', target) is not None, 'full target SHA required')
        return self.control / ('b0-controller-repair-' + target)

    def apply(self, target: str, approved: str) -> None:
        with self.locked():
            plan = self.plan(target)
            require(digest(canonical(plan)) == approved, 'reviewed plan drifted')
            run = self.run_path(target)
            run.mkdir(mode=0o700)  # Existing/partial runs must use explicit rollback, never blind retry.
            durable(run / 'plan.json', canonical(plan))
            durable(run / 'index.backup', regular(self.repo / '.git/index')[0])
            for number, versions in enumerate(plan['entries'].values()):
                if versions[0]:
                    durable(run / f'old-blob-{number}', self.git('cat-file', 'blob', versions[0][1]))
            durable(run / 'prepared', canonical({'plan_sha256': approved}))
            # This is an audited control recovery only. No target code or hook
            # is invoked; the installed entrypoint and all markers stay intact.
            self.git('merge', '--ff-only', '--no-edit', target)
            require(not self.git('status', '--porcelain=v1').strip(), 'post-repair checkout is dirty')
            require(self.git('rev-parse', 'HEAD').decode().strip() == target, 'target not reached')
            require(self.protected() == plan['protected'], 'protected state changed')
            require((self.repo / '.git').stat().st_ino == plan['git_directory_inode'], 'Git directory replaced')
            durable(run / 'control-repaired', canonical({'application_deployed': False, 'target': target}))

    def rollback(self, target: str, approved: str) -> None:
        with self.locked():
            self.hazards()
            run = self.run_path(target)
            data, _ = regular(run / 'plan.json')
            require(digest(data) == approved, 'rollback plan differs from review')
            plan = json.loads(data)
            require(plan['preimage'] == self.preimage and plan['target'] == target, 'rollback identity mismatch')
            require(not (run / 'ordinary-handoff').exists(), 'ordinary deployment handoff forbids rollback')
            require(self.protected() == plan['protected'], 'protected state drift forbids rollback')
            require(self.git('rev-parse', 'HEAD').decode().strip() in (self.preimage, target), 'unknown HEAD')
            require((self.repo / '.git').stat().st_ino == plan['git_directory_inode'], 'Git directory replaced')
            allowed = set(plan['entries'])
            for args in (('diff', '--name-only', '--no-renames', self.preimage),
                         ('diff', '--cached', '--name-only', '--no-renames', self.preimage)):
                require(set(self.git(*args).decode().splitlines()) <= allowed, 'unrelated edits forbid rollback')
            # Recognize mixed file/index/ref states, not just old/new HEAD.
            for name, versions in plan['entries'].items():
                path = self.repo / name
                if os.path.lexists(path):
                    content, identity = regular(path)
                    require(any(v and v[2] == digest(content) and int(v[0][-3:], 8) == stat.S_IMODE(identity[2])
                                for v in versions), 'unknown bytes/mode in interrupted repair')
                else:
                    require(versions[0] is None, 'missing historical file needs investigation')
                indexed = self.git('ls-files', '--stage', '--', name).decode().strip()
                require(not indexed or any(v and indexed == f'{v[0]} {v[1]} 0\t{name}' for v in versions),
                        'unknown index entry needs investigation')
            for name, versions in plan['entries'].items():
                if versions[0]:
                    self.git('restore', '--source=' + self.preimage, '--staged', '--worktree', '--', name)
                else:
                    self.git('update-index', '--force-remove', '--', name)
                    path = self.repo / name
                    if path.exists():
                        path.unlink()  # Only a new, reviewed, hash-verified repair file.
            self.git('checkout', '--detach', self.preimage)
            require(not self.git('status', '--porcelain=v1').strip(), 'rollback is not clean')
            require(self.protected() == plan['protected'], 'rollback changed protected state')
            durable(run / 'rolled-back', canonical({'preimage': self.preimage}))

    def handoff(self, target: str, approved: str) -> None:
        with self.locked():
            self.hazards()
            run = self.run_path(target)
            data, _ = regular(run / 'plan.json')
            require(digest(data) == approved, 'handoff plan differs from review')
            plan = json.loads(data)
            require((run / 'control-repaired').is_file(), 'control repair has not completed')
            require(self.remote() == target and self.git('rev-parse', 'HEAD').decode().strip() == target,
                    'handoff target/lease drifted')
            require(not self.git('status', '--porcelain=v1').strip(), 'handoff checkout is dirty')
            require(self.protected() == plan['protected'], 'handoff protected state changed')
            durable(run / 'ordinary-handoff', canonical({'target': target, 'application_deployed': False}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('inspect', 'apply', 'rollback', 'handoff'))
    parser.add_argument('target')
    parser.add_argument('--approved-plan-sha256', default='')
    args = parser.parse_args()
    require(os.geteuid() == 0 and Path('/etc/machine-id').read_text().strip() == MACHINE,
            'operator recovery is pinned to the production machine')
    require(not any(key.startswith('GIT_') for key in os.environ), 'Git environment overrides refused')
    repair = ControllerRepair(ROOT, PREIMAGE, LIVE, CONTROLLER_SHA256)
    require(repair.git('remote', 'get-url', 'origin').decode().strip() == ORIGIN, 'origin differs')
    if args.action == 'inspect':
        with repair.locked():
            plan = repair.plan(args.target)
        print(canonical({'plan': plan, 'plan_sha256': digest(canonical(plan))}).decode(), end='')
    else:
        require(re.fullmatch('[0-9a-f]{64}', args.approved_plan_sha256) is not None, 'reviewed plan SHA256 required')
        getattr(repair, args.action)(args.target, args.approved_plan_sha256)
        print(canonical({'action': args.action, 'target': args.target, 'application_deployed': False}).decode(), end='')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(f'b0-controller-repair-refused: {error}', file=sys.stderr)
        sys.exit(1)
