"""Install one reviewed fixed Telegram source cascade; never enables a service."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import uuid

MACHINE = 'b28fc7b17042414386eb9b114046e50c'
STATE = Path('/var/lib/platform/social-monitor/collection')
LIB = Path('/usr/local/lib/social-monitor/current-source-guard')
TG = Path('/usr/local/lib/social-monitor/telegram-channel')
FENCE = '/usr/local/sbin/social-monitor-posts-generation-fence'
ALLOWED = {
    LIB / 'current_profile_admission.py': 0o600,
    LIB / 'physical_operator_epoch.py': 0o600,
    LIB / 'current_admission_sources.py': 0o600,
    LIB / 'current_telegram_channel_admission.py': 0o644,
    TG / 'telegram-channel-mode.sh': 0o644,
    TG / 'collection-entrypoint.sh': 0o644,
    Path('/usr/local/sbin/social-monitor-posts-once'): 0o755,
    Path('/usr/local/sbin/social-monitor-posts-history-preclaim.sh'): 0o644,
    Path('/usr/local/sbin/social-monitor-posts-current-authority-stage'): 0o755,
    Path('/etc/systemd/system/social-monitor-telegram-channel.service'): 0o644,
    Path('/etc/systemd/system/social-monitor-telegram-channel.timer'): 0o644,
}


def need(value, reason):
    if not value:
        raise ValueError(reason)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def unique(pairs):
    result = dict(pairs)
    need(len(result) == len(pairs), 'duplicate bundle field')
    return result


def parent_safe(path):
    for parent in path.parents:
        info = parent.lstat()
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and not info.st_mode & 0o022, 'unsafe ancestor: ' + str(parent))


def existing(path, mode):
    parent_safe(path)
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0
         and stat.S_IMODE(info.st_mode) == mode and info.st_nlink == 1,
         'unsafe existing source: ' + str(path))
    return path.read_bytes()


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_new(path, raw, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)


def admission():
    result = subprocess.run([FENCE, 'admit'], check=True, capture_output=True,
                            text=True, timeout=300, pass_fds=(9,))
    need(result.stdout.strip() == 'social_monitor_collection_v2', 'unexpected native generation')


def telegram_units_quiet():
    for suffix in ('service', 'timer'):
        name = 'social-monitor-telegram-channel.' + suffix
        result = subprocess.run(['systemctl', 'show', name, '--property=LoadState,ActiveState,SubState,Job'],
                                check=True, capture_output=True, text=True, timeout=15)
        fields = dict(line.split('=', 1) for line in result.stdout.splitlines())
        need(fields.get('ActiveState') == 'inactive' and fields.get('SubState') == 'dead'
             and fields.get('Job') in ('', '0'), 'Telegram unit not quiet: ' + name)
        enabled = subprocess.run(['systemctl', 'is-enabled', name], capture_output=True, text=True, timeout=15)
        missing = fields.get('LoadState') == 'not-found' and enabled.returncode != 0 and enabled.stdout.strip() in ('', 'not-found')
        need(missing or (enabled.returncode in (0, 1, 4) and enabled.stdout.strip() in ('not-found', 'disabled', 'static')),
             'Telegram unit already enabled: ' + name)


def interrupted(signum, _frame):
    raise RuntimeError('installation interrupted by signal ' + str(signum))


def main():
    need(os.geteuid() == 0 and Path('/etc/machine-id').read_text().strip() == MACHINE,
         'fixed production root required')
    need(len(sys.argv) == 2, 'expected reviewed bundle path')
    bundle_path = Path(sys.argv[1])
    raw = existing(bundle_path, 0o600)
    need(len(raw) <= 2_000_000, 'bundle too large')
    bundle = json.loads(raw, object_pairs_hook=unique)
    need(set(bundle) == {'version', 'machineId', 'files'} and type(bundle['version']) is int
         and bundle['version'] == 1 and bundle['machineId'] == MACHINE
         and type(bundle['files']) is list and len(bundle['files']) == len(ALLOWED), 'bundle schema changed')
    files = {}
    for item in bundle['files']:
        need(type(item) is dict and set(item) == {'path', 'mode', 'beforeSha256', 'afterSha256', 'content'},
             'bundle file schema changed')
        path = Path(item['path'])
        need(path in ALLOWED and path not in files and type(item['mode']) is int
             and item['mode'] == ALLOWED[path] and type(item['content']) is str, 'unexpected bundle target')
        content = item['content'].encode('utf-8')
        need(0 < len(content) <= 200_000 and digest(content) == item['afterSha256'], 'bundle content changed')
        files[path] = (item, content)
    # The fd number is part of the unchanged native fence contract.
    lock = STATE / '.posts-once.lock'
    existing(lock, 0o600)
    fd = os.open(lock, os.O_RDWR | os.O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        print('Telegram installation deferred: global collection lock is busy')
        return 75
    if fd != 9:
        os.dup2(fd, 9)
        os.close(fd)
    os.set_inheritable(9, True)
    need(os.fstat(9).st_ino == lock.lstat().st_ino, 'global lock rebound')
    admission()  # Native owner/yield/source/closed-role checks before any mutation.
    telegram_units_quiet()
    for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(signum, interrupted)
    old = {}
    for path, (item, _) in files.items():
        if item['beforeSha256'] is None:
            need(not os.path.lexists(path), 'new target already exists: ' + str(path))
            if path.parent != TG:
                parent_safe(path)
            old[path] = None
        else:
            before = existing(path, ALLOWED[path])
            need(digest(before) == item['beforeSha256'], 'retained source changed: ' + str(path))
            old[path] = before
    if os.path.lexists(TG):
        info = TG.lstat()
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and stat.S_IMODE(info.st_mode) == 0o700, 'unsafe Telegram source directory')
    else:
        parent_safe(TG)
        TG.mkdir(mode=0o700)
        sync_dir(TG.parent)
    backup = STATE / ('telegram-admission-install-' + str(uuid.uuid4()))
    backup.mkdir(mode=0o700)
    write_new(backup / 'bundle.json', raw, 0o600)
    staged = {}
    for index, (path, (item, content)) in enumerate(files.items()):
        if old[path] is not None:
            write_new(backup / (str(index) + '.before'), old[path], 0o600)
        pending = path.parent / ('.telegram-stage-' + backup.name + '-' + str(index))
        write_new(pending, content, item['mode'])
        staged[path] = pending
    sync_dir(backup)
    published = []
    try:
        for path, pending in staged.items():
            published.append(path)
            os.replace(pending, path)
            sync_dir(path.parent)
        for path, (item, _) in files.items():
            need(digest(existing(path, item['mode'])) == item['afterSha256'], 'installed cascade changed')
        admission()  # Verify the complete resulting cascade under the same lock.
        subprocess.run(['systemctl', 'daemon-reload'], check=True, timeout=30)
        telegram_units_quiet()
    except BaseException:
        for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
            signal.signal(signum, signal.SIG_IGN)
        for path in reversed(published):
            if old[path] is None:
                if os.path.lexists(path):
                    path.unlink()
            else:
                restore = path.parent / ('.telegram-restore-' + backup.name)
                write_new(restore, old[path], ALLOWED[path])
                os.replace(restore, path)
            sync_dir(path.parent)
        for path, before in old.items():
            need((not os.path.lexists(path)) if before is None else existing(path, ALLOWED[path]) == before,
                 'ROLLBACK UNCERTAIN: ' + str(path))
        admission()
        subprocess.run(['systemctl', 'daemon-reload'], check=True, timeout=30)
        raise
    finally:
        for pending in staged.values():
            if os.path.lexists(pending):
                pending.unlink()
    print(json.dumps({'status': 'installed_timer_disabled', 'backup': str(backup), 'files': len(files)}))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print('Telegram installation refused: ' + str(error), file=sys.stderr)
        sys.exit(78)
