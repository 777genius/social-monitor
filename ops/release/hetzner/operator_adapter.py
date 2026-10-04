#!/opt/social-monitor-release-python/bin/python3 -IB
"""Six fixed read-only operator observations consumed by Host.evidence."""
import os
from pathlib import Path
import select
import signal
import stat
import subprocess
import sys
import time

INSTALL = Path('/opt/social-monitor-release')
MODULES = ('contract', 'evidence', 'prisma_history', 'operator_adapter', 'operator_config', 'operator_github',
           'operator_backup', 'operator_database', 'operator_probe', 'observer_token')

# Only the fixed installed code directory enters the isolated interpreter path.
# Normal test imports use the canonical worktree modules; ignored copies never load.
if __name__ == '__main__':
    try:
        if (Path(__file__) != INSTALL / 'operator_adapter.py' or os.geteuid() != 0
                or sys.executable != '/opt/social-monitor-release-python/bin/python3'
                or not sys.flags.isolated or not sys.flags.dont_write_bytecode):
            raise ValueError()
        paths = [Path('/etc/social-monitor/release/operator-adapter'),
                 Path(sys.executable), Path('/opt/social-monitor-release-python/pyvenv.cfg'),
                 *(INSTALL / (name + '.py') for name in MODULES)]
        cache = INSTALL / '__pycache__'
        if cache.exists() or cache.is_symlink():
            paths.append(cache)
            if cache.is_symlink() or not cache.is_dir():
                raise ValueError()
            cached = list(cache.iterdir())
            if len(cached) > 64:
                raise ValueError()
            paths.extend(cached)
        for path in paths:
            for parent in (path, *path.parents):
                info = parent.lstat()
                if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
                    raise ValueError()
            if not (stat.S_ISREG(path.stat().st_mode) or path == cache and path.is_dir()):
                raise ValueError()
        sys.path.insert(0, str(INSTALL))
    except (OSError, ValueError):
        sys.stderr.write('operator-denied\n')
        sys.exit(1)

from contract import DIGEST, RUN, SHA, MACHINE, Denied, canonical, require, trusted
from operator_config import ENV, EXECUTABLES, decode, exact, load, match, private_bytes
import operator_backup
import operator_database
import operator_github
import operator_probe

STANDARD = {'sha': SHA, 'ci_run_id': RUN, 'archive_sha256': DIGEST, 'image_id': DIGEST}
REQUESTS = {'preflight': {}, 'postgres-identity': {}, 'database': STANDARD,
            'backup': STANDARD, 'release-evidence': {**STANDARD, 'production_revision': SHA},
            'probe': {'sha': SHA, 'image_id': DIGEST, 'container_id': r'[0-9a-f]{64}'}}


def request(verb, raw):
    require(verb in REQUESTS, 'operator-verb')
    value = decode(raw, 16384)
    exact(value, REQUESTS[verb])
    require(all(match(pattern, value[key]) for key, pattern in REQUESTS[verb].items()), 'operator-binding')
    return value


class Runner:
    def __init__(self, seconds=150, command_seconds=30, checker=trusted):
        self.end = time.monotonic() + seconds
        self.command_seconds, self.checker = command_seconds, checker

    def run(self, argv, data=None, env=None, limit=2 * 1024**2):
        require(isinstance(argv, list) and 0 < len(argv) <= 32
                and all(isinstance(a, str) and '\0' not in a and len(a) <= 16384 for a in argv),
                'operator-command')
        # Production call sites supply only these fixed executable names.
        path = self.checker(argv[0])
        before = path.stat()
        end = min(self.end, time.monotonic() + self.command_seconds)
        require(time.monotonic() < end and (data is None or type(data) is bytes and len(data) <= 4096),
                'operator-command-budget')
        child = None
        output = bytearray()
        error_bytes = 0
        try:
            child = subprocess.Popen(argv, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     env={**ENV, **(env or {})}, start_new_session=True, close_fds=True)
            if data is not None:
                # One bounded PIPE_BUF write; no unbounded communicate() buffering.
                require(os.write(child.stdin.fileno(), data) == len(data), 'operator-command-input')
                child.stdin.close()
            fds = {child.stdout.fileno(): True, child.stderr.fileno(): False}
            while fds:
                remaining = end - time.monotonic()
                require(remaining > 0, 'operator-command-deadline')
                ready = select.select(list(fds), [], [], remaining)[0]
                require(ready, 'operator-command-deadline')
                for fd in ready:
                    chunk = os.read(fd, 65536)
                    if not chunk:
                        del fds[fd]
                    elif fds[fd]:
                        output.extend(chunk)
                        require(len(output) <= limit, 'operator-command-output')
                    else:
                        error_bytes += len(chunk)
                        require(error_bytes <= 65536, 'operator-command-errors')
            require(child.wait(timeout=max(0.001, end - time.monotonic())) == 0
                    and error_bytes == 0, 'operator-command-status')
            after = self.checker(argv[0]).stat()
            def inode(info):
                return (info.st_dev, info.st_ino, info.st_size, info.st_mode,
                        info.st_uid, info.st_gid, info.st_mtime_ns, info.st_ctime_ns)
            require(inode(before) == inode(after), 'operator-command-changed')
            return bytes(output)
        except (OSError, subprocess.SubprocessError):
            raise Denied('operator-command-failed') from None
        finally:
            if child is not None:
                # Reap the whole process group, including descendants holding pipes.
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
                for stream in (child.stdin, child.stdout, child.stderr):
                    if stream is not None:
                        stream.close()


def dispatch(verb, binding, config, runner):
    now = int(time.time())
    if verb == 'postgres-identity':
        result = operator_database.identity(config, runner)
    elif verb == 'database':
        result = operator_database.database(config, runner)
    elif verb == 'backup':
        result = operator_backup.backup(config, runner, binding, now)
    elif verb == 'probe':
        result = operator_probe.probe(config, runner, binding)
    elif verb == 'release-evidence':
        result = operator_github.release(config, runner, binding)
    else:
        require(verb == 'preflight', 'operator-verb')
        legacy = operator_github.GitHub(config, runner).legacy()
        db = operator_database.database(config, runner)
        require(not db['failed_migrations'], 'operator-preflight-history')
        operator_backup.backup(config, runner, {}, now)
        target = operator_probe.inspect(runner, 'platform-social-monitor-api-1')
        operator_probe.probe(config, runner, {'container_id': target['id'], 'image_id': target['image']})
        result = {'configured': True, 'legacy_workflow': legacy}
    config.recheck()
    response = {**result, **binding, 'version': 1, 'observed_at': int(time.time())}
    raw = canonical(response)
    require(len(raw) <= 2 * 1024**2 and time.monotonic() < runner.end, 'operator-response-budget')
    return raw + b'\n'


def read_request(stream):
    end, output = time.monotonic() + 5, bytearray()
    while True:
        remaining = end - time.monotonic()
        require(remaining > 0 and select.select([stream.fileno()], [], [], remaining)[0], 'operator-input-deadline')
        chunk = os.read(stream.fileno(), 16385 - len(output))
        if not chunk:
            return bytes(output)
        output.extend(chunk)
        require(len(output) <= 16384, 'operator-input-size')


def main():
    try:
        require(len(sys.argv) == 2, 'operator-arguments')
        verb = sys.argv[1]
        binding = request(verb, read_request(sys.stdin.buffer))
        # Discard loader, proxy, GitHub, libpq and pgBackRest caller environment.
        os.environ.clear()
        runner = Runner()
        require(private_bytes('/etc/machine-id', 128).strip().decode('ascii') == MACHINE, 'operator-machine')
        config = load()
        sys.stdout.buffer.write(dispatch(verb, binding, config, runner))
        return 0
    except Exception:
        # Never expose config, tokens, SQL, provider bodies, manifest or exceptions.
        sys.stderr.write('operator-denied\n')
        return 1


if __name__ == '__main__':
    sys.exit(main())
