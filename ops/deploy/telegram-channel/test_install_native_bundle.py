"""Real installer publication/rollback on disposable files, never native services."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest


INSTALLER = Path(__file__).with_name('install-native-bundle.py')
TARGETS = (
    ('lib/current_profile_admission.py', 0o644, True),
    ('lib/physical_operator_epoch.py', 0o644, True),
    ('lib/current_admission_sources.py', 0o644, True),
    ('lib/current_telegram_channel_admission.py', 0o644, False),
    ('telegram/telegram-channel-mode.sh', 0o644, False),
    ('telegram/collection-entrypoint.sh', 0o644, False),
    ('sbin/social-monitor-posts-once', 0o755, True),
    ('sbin/social-monitor-posts-history-preclaim.sh', 0o644, True),
    ('sbin/social-monitor-posts-current-authority-stage', 0o755, True),
    ('systemd/social-monitor-telegram-channel.service', 0o644, False),
    ('systemd/social-monitor-telegram-channel.timer', 0o644, False),
)
CHILD = r'''
import hashlib, importlib.util, json, os, pathlib, stat, sys, types
root = pathlib.Path(sys.argv[2]).resolve()
scenario = sys.argv[3]
spec = importlib.util.spec_from_file_location('sandbox_telegram_installer', sys.argv[1])
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
events = []
allowed = {}
for path, mode in installer.ALLOWED.items():
    if path.parent == installer.LIB:
        directory = 'lib'
    elif path.parent == installer.TG:
        directory = 'telegram'
    elif path.parent == pathlib.Path('/usr/local/sbin'):
        directory = 'sbin'
    elif path.parent == pathlib.Path('/etc/systemd/system'):
        directory = 'systemd'
    else:
        raise AssertionError('Unreviewed native target')
    target = root / directory / path.name
    assert target not in allowed
    allowed[target] = mode
assert len(allowed) == 11
installer.ALLOWED = allowed
installer.STATE = root / 'state'
installer.TG = root / 'telegram'
installer.MACHINE = 'sandbox-machine-identity'

def confined(path):
    assert path.is_absolute() and root in path.parents, 'Attempted non-sandbox filesystem access'

def parent_safe(path):
    confined(path)
    for parent in path.parents:
        if parent == root:
            break
        info = parent.lstat()
        assert stat.S_ISDIR(info.st_mode) and not info.st_mode & 0o022

def existing(path, mode):
    parent_safe(path)
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == mode and info.st_nlink == 1
    return path.read_bytes()

installer.parent_safe = parent_safe
installer.existing = existing
# Substitute only the fixed-machine/root checks; no production path is opened.
installer.os.geteuid = lambda: 0
original_read_text = pathlib.Path.read_text
def read_text(path, *args, **kwargs):
    if str(path) == '/etc/machine-id':
        return installer.MACHINE
    confined(path)
    return original_read_text(path, *args, **kwargs)
pathlib.Path.read_text = read_text

admissions = 0
def admission():
    global admissions
    admissions += 1
    events.append('admit')
    assert installer.os.fstat(9).st_ino == (installer.STATE / '.posts-once.lock').stat().st_ino
    if scenario == 'post-admission-failure' and admissions == 2:
        raise RuntimeError('synthetic resulting-admission refusal')
installer.admission = admission

def native_run(command, **kwargs):
    events.append(command)
    assert command[0] == 'systemctl', 'No native process may run'
    if command == ['systemctl', 'daemon-reload']:
        return types.SimpleNamespace(returncode=0, stdout='')
    assert len(command) >= 3 and command[2] in (
        'social-monitor-telegram-channel.service', 'social-monitor-telegram-channel.timer')
    if command[1] == 'show':
        assert command[3:] == ['--property=LoadState,ActiveState,SubState,Job']
        return types.SimpleNamespace(returncode=0, stdout='LoadState=loaded\nActiveState=inactive\nSubState=dead\nJob=0\n')
    assert command[1] == 'is-enabled' and len(command) == 3, 'No enabling, starting or stopping units'
    return types.SimpleNamespace(returncode=1, stdout='disabled\n')
installer.subprocess.run = native_run

original_replace = installer.os.replace
replacements = 0
def replace(source, target):
    global replacements
    confined(pathlib.Path(source))
    confined(pathlib.Path(target))
    replacements += 1
    if scenario == 'mid-publication-failure' and replacements == 5:
        raise OSError('synthetic publication failure after existing and new targets')
    return original_replace(source, target)
installer.os.replace = replace
os.umask(0o077)
sys.argv = [str(pathlib.Path(sys.argv[1])), str(root / 'bundle.json')]
try:
    result = installer.main()
    error = None
except BaseException as caught:
    result, error = 78, type(caught).__name__
targets = {}
for target in allowed:
    confined(target)
    targets[str(target.relative_to(root))] = None if not target.exists() else {
        'sha': hashlib.sha256(target.read_bytes()).hexdigest(), 'mode': stat.S_IMODE(target.stat().st_mode)}
print('SANDBOX_RESULT=' + json.dumps({'code': result, 'error': error, 'events': events,
    'targets': targets, 'staged': [str(path.relative_to(root)) for path in root.rglob('.telegram-stage-*')],
    'backups': len(list(installer.STATE.glob('telegram-admission-install-*')))}))
'''


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


class NativeInstallerTests(unittest.TestCase):
    def run_install(self, scenario='success'):
        with tempfile.TemporaryDirectory(prefix='telegram-installer-test-') as directory:
            root = Path(directory)
            for name in ('lib', 'sbin', 'systemd', 'state'):
                (root / name).mkdir(mode=0o700)
            lock = root / 'state/.posts-once.lock'
            lock.write_bytes(b'')
            lock.chmod(0o600)
            entries, before, after = [], {}, {}
            for name, mode, retained in TARGETS:
                path = root / name
                original = ('old ' + name + '\n').encode()
                content = 'reviewed new ' + name + '\n'
                if retained:
                    path.write_bytes(original)
                    path.chmod(mode)
                before[name] = {'sha': digest(original), 'mode': mode} if retained else None
                after[name] = {'sha': digest(content.encode()), 'mode': mode}
                entries.append({'path': str(path), 'mode': mode, 'beforeSha256': digest(original) if retained else None,
                                'afterSha256': digest(content.encode()), 'content': content})
            if scenario == 'bad-bundle':
                entries[3]['afterSha256'] = '0' * 64
            if scenario == 'preimage-drift':
                path = root / TARGETS[1][0]
                path.write_bytes(b'drifted preimage\n')
                before[TARGETS[1][0]]['sha'] = digest(path.read_bytes())
            bundle = root / 'bundle.json'
            bundle.write_text(json.dumps({'version': 1, 'machineId': 'sandbox-machine-identity', 'files': entries}))
            bundle.chmod(0o600)
            with lock.open('r+b') as held:
                if scenario == 'busy-lock':
                    fcntl.flock(held.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                process = subprocess.run([sys.executable, '-I', '-S', '-B', '-c', CHILD, str(INSTALLER), str(root), scenario],
                    cwd=root, env={'PATH': '/usr/bin:/bin', 'LANG': 'C'}, capture_output=True, text=True, timeout=30, check=False)
            self.assertEqual(process.returncode, 0, process.stderr)
            lines = [line for line in process.stdout.splitlines() if line.startswith('SANDBOX_RESULT=')]
            self.assertEqual(len(lines), 1, process.stdout + process.stderr)
            return json.loads(lines[0].split('=', 1)[1]), before, after

    def test_success_keeps_units_disabled_and_publishes_exact_bytes_and_modes_under_umask_077(self):
        result, _, expected = self.run_install()
        self.assertEqual(result['code'], 0, result)
        self.assertIsNone(result['error'])
        self.assertEqual(result['targets'], expected)
        self.assertEqual(result['events'].count('admit'), 2)
        commands = [event for event in result['events'] if isinstance(event, list)]
        self.assertEqual(sum(command[1] == 'daemon-reload' for command in commands), 1)
        self.assertEqual(sum(command[1] == 'is-enabled' for command in commands), 4)
        self.assertFalse(any(command[1] in ('enable', 'start', 'stop', 'restart') for command in commands))
        self.assertEqual(result['staged'], [])
        self.assertEqual(result['backups'], 1)

    def test_post_install_admission_refusal_restores_every_preimage_and_removes_every_new_file(self):
        result, expected, _ = self.run_install('post-admission-failure')
        self.assertEqual(result['code'], 78)
        self.assertEqual(result['targets'], expected)
        self.assertEqual(result['events'].count('admit'), 3)
        self.assertEqual(result['staged'], [])

    def test_mid_publication_failure_rolls_back_both_new_and_replaced_targets(self):
        result, expected, _ = self.run_install('mid-publication-failure')
        self.assertEqual(result['code'], 78)
        self.assertEqual(result['targets'], expected)
        self.assertEqual(result['events'].count('admit'), 2)
        self.assertEqual(result['staged'], [])

    def test_busy_real_flock_returns_75_without_admission_or_publication(self):
        result, expected, _ = self.run_install('busy-lock')
        self.assertEqual(result['code'], 75)
        self.assertEqual(result['targets'], expected)
        self.assertEqual(result['events'], [])
        self.assertEqual(result['backups'], 0)

    def test_invalid_bundle_is_rejected_before_native_admission_or_any_write(self):
        result, expected, _ = self.run_install('bad-bundle')
        self.assertEqual(result['code'], 78)
        self.assertEqual(result['targets'], expected)
        self.assertEqual(result['events'], [])
        self.assertEqual(result['backups'], 0)

    def test_retained_preimage_drift_is_rejected_before_staging_or_publication(self):
        result, expected, _ = self.run_install('preimage-drift')
        self.assertEqual(result['code'], 78)
        self.assertEqual(result['targets'], expected)
        self.assertEqual(result['events'].count('admit'), 1)
        self.assertEqual(result['staged'], [])
        self.assertEqual(result['backups'], 0)


if __name__ == '__main__':
    unittest.main()
