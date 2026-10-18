"""Exercise the real shell EXIT/TERM cleanup with isolated native dependencies."""
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


MODULE = Path(__file__).with_name('telegram-channel-mode.sh')
NATIVE_PREFIX = '/usr/bin/python3 -I -S -B /usr/local/lib/social-monitor/current-source-guard/current_telegram_channel_admission.py'
ATTEMPT = '20261018T210000Z-12345678-1234-4234-8234-123456789abc'
NATIVE_STUB = r'''
import hashlib, json, os, pathlib, sys
record = pathlib.Path(os.environ['SANDBOX_RECORD'])
with open(os.environ['EVENTS'], 'a') as log:
    log.write('validate-terminal\n')
assert sys.argv[1:] == ['validate-terminal', os.environ['ATTEMPT']]
if (record / 'watchdog-fired').exists():
    sys.exit(1)
proof = json.loads((record / 'terminal-proof').read_text())
assert proof['attemptId'] == os.environ['ATTEMPT']
for filename, field in [('state', 'stateSha256'), ('result.json', 'resultSha256'),
                        ('started-state', 'startedStateSha256'), ('release.json', 'releaseSha256')]:
    assert hashlib.sha256((record / filename).read_bytes()).hexdigest() == proof[field]
result = json.loads((record / 'result.json').read_text())
assert result['ok'] is True and result['complete'] is False and result['status'] == 'partial'
sys.exit(int(os.environ['VERIFY_RC']))
'''
SHELL = r'''
set -euo pipefail
umask 077
source "$MODULE_UNDER_TEST"
event() { printf '%s\n' "$*" >> "$EVENTS"; }
revoke_role() { event revoke-role; return "$ROLE_RC"; }
remove_container() { event remove-container; return "$REMOVE_RC"; }
role_closed() { event role-closed; return 0; }
psql_data() { event counts; printf '11,11\n'; }
stop_watchdog() {
  event stop-watchdog
  if [[ $WATCHDOG_FIRES_ON_STOP == 1 ]]; then printf 'fired\n' > "$SANDBOX_RECORD/watchdog-fired"; fi
  return 0
}
container_absent() { event container-absent; return 0; }
watchdog_inactive() { event watchdog-inactive; return 0; }
record=$SANDBOX_RECORD
id=$ATTEMPT
day=2026-10-18
artifact=telegram-hiaimediaen-20261018-20-12345678-1234-4234-8234-123456789abc
slot=20
telegram_release_sha=$RELEASE_SHA
before=10,10
name=social-posts-$id
watchdog_unit=social-posts-wd-12345678-1234-4234-8234-123456789abc
collector_rc=0
collector_quiesced=1
trap telegram_channel_cleanup EXIT
trap 'exit 143' TERM
if [[ $TRIGGER == term ]]; then kill -TERM "$$"; exit 99; fi
exit 0
'''


class TelegramCleanupTests(unittest.TestCase):
    def run_cleanup(self, role_rc=0, remove_rc=0, verify_rc=0, trigger='exit', watchdog_fires_on_stop=False):
        with tempfile.TemporaryDirectory(prefix='telegram-channel-cleanup-test-') as directory:
            root = Path(directory)
            record = root / 'attempt'
            record.mkdir(mode=0o700)
            release = b'{"channel":"hiaimediaen"}\n'
            (record / 'release.json').write_bytes(release)
            (record / 'started-state').write_text('STARTED mode=telegram-channel\n')
            (record / 'state').write_text('STARTED mode=telegram-channel\n')
            (record / 'result.json').write_text(json.dumps({'ok': True, 'mode': 'collect',
                'channel': 'hiaimediaen', 'complete': False, 'status': 'partial'}) + '\n')
            stub = root / 'native_stub.py'
            stub.write_text(NATIVE_STUB)
            source = MODULE.read_text()
            self.assertEqual(source.count(NATIVE_PREFIX), 3, 'Review any new native command site before rebinding it')
            replacement = '/usr/bin/python3 -I -S -B ' + shlex.quote(str(stub))
            rebound = source.replace(NATIVE_PREFIX, replacement)
            self.assertEqual(rebound.replace(replacement, NATIVE_PREFIX), source,
                             'Only the native executable dependency may change; preserve shell cleanup bytes')
            module_copy = root / 'mode-under-test.sh'
            module_copy.write_text(rebound)
            events = root / 'events'
            env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C',
                   'MODULE_UNDER_TEST': str(module_copy), 'SANDBOX_RECORD': str(record),
                   'EVENTS': str(events), 'ATTEMPT': ATTEMPT, 'RELEASE_SHA': hashlib.sha256(release).hexdigest(),
                   'ROLE_RC': str(role_rc), 'REMOVE_RC': str(remove_rc), 'VERIFY_RC': str(verify_rc), 'TRIGGER': trigger,
                   'WATCHDOG_FIRES_ON_STOP': '1' if watchdog_fires_on_stop else '0'}
            process = subprocess.run(['/bin/bash', '-c', SHELL], env=env, cwd=root,
                                     capture_output=True, text=True, timeout=20, check=False)
            return {'exit': process.returncode, 'stderr': process.stderr,
                    'events': events.read_text().splitlines() if events.exists() else [],
                    'state': (record / 'state').read_text(),
                    'proof': json.loads((record / 'terminal-proof').read_text()) if (record / 'terminal-proof').exists() else None}

    def test_revocation_failure_still_removes_container_and_keeps_watchdog_armed(self):
        result = self.run_cleanup(role_rc=1)
        self.assertEqual(result['exit'], 1, result['stderr'])
        self.assertEqual(result['events'], ['revoke-role', 'remove-container'])
        self.assertTrue(result['state'].startswith('FAILED_POSSIBLE_WRITES mode=telegram-channel '))
        self.assertIsNone(result['proof'])

    def test_container_removal_failure_cannot_publish_terminal_success(self):
        result = self.run_cleanup(remove_rc=1)
        self.assertEqual(result['exit'], 1, result['stderr'])
        self.assertEqual(result['events'], ['revoke-role', 'remove-container'])
        self.assertNotIn('COMPLETED_VALIDATED', result['state'])
        self.assertIsNone(result['proof'])

    def test_partial_runner_success_is_verified_before_watchdog_is_stopped(self):
        result = self.run_cleanup()
        self.assertEqual(result['exit'], 0, result['stderr'])
        self.assertTrue(result['state'].startswith('COMPLETED_VALIDATED mode=telegram-channel '))
        self.assertEqual(result['events'], ['revoke-role', 'remove-container', 'role-closed', 'counts',
            'validate-terminal', 'stop-watchdog', 'role-closed', 'container-absent', 'watchdog-inactive', 'validate-terminal'])
        self.assertEqual(result['proof']['attemptId'], ATTEMPT)

    def test_invalid_native_proof_keeps_watchdog_armed_and_leaves_unresolved_state(self):
        result = self.run_cleanup(verify_rc=1)
        self.assertEqual(result['exit'], 1, result['stderr'])
        self.assertIn('validate-terminal', result['events'])
        self.assertNotIn('stop-watchdog', result['events'])
        self.assertTrue(result['state'].startswith('UNRESOLVED mode=telegram-channel '))

    def test_watchdog_firing_during_stop_is_rejected_after_watchdog_quiescence(self):
        result = self.run_cleanup(watchdog_fires_on_stop=True)
        self.assertEqual(result['exit'], 1, result['stderr'])
        self.assertEqual(result['events'][-3:], ['container-absent', 'watchdog-inactive', 'validate-terminal'])
        self.assertEqual(result['events'].count('validate-terminal'), 2)
        self.assertTrue(result['state'].startswith('UNRESOLVED mode=telegram-channel '))

    def test_actual_term_trap_runs_cleanup_without_qualifying_successful_child_output(self):
        result = self.run_cleanup(trigger='term')
        self.assertEqual(result['exit'], 1, result['stderr'])
        self.assertEqual(result['events'][:3], ['revoke-role', 'remove-container', 'role-closed'])
        self.assertNotIn('validate-terminal', result['events'])
        self.assertNotIn('stop-watchdog', result['events'])
        self.assertTrue(result['state'].startswith('FAILED_POSSIBLE_WRITES mode=telegram-channel '))


if __name__ == '__main__':
    unittest.main()
