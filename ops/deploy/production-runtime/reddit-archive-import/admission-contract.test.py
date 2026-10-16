"""Offline native admission contracts; no Docker, provider, database or claims."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import subprocess
import types
import unittest

ROOT = Path(__file__).parent
stub = types.ModuleType('render_guard')
stub.decode = json.loads

def need(ok, message):
    if not ok:
        raise ValueError(message)

stub.need = need
sys.modules['render_guard'] = stub
spec = importlib.util.spec_from_file_location('reddit_admission', ROOT / 'current_reddit_archive_import_admission.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    key = 'a' * 64
    part = {k: 'b' * 64 for k in ('planSha256', 'packetSha256', 'archiveSha256', 'itemsSha256')}
    part.update(semanticKey=key, day='2026-09-20', bindingConfigSha256=hashlib.sha256(b'{}').hexdigest(),
                journalFilename=f'reddit-archive-qualified-{key}.journal.json', selectedIds=['reddit:t3_abcd'],
                inputHostRoot='/var/lib/platform/social-monitor/reddit-archive-inputs/fixture/2026-09-20')
    return {'schemaVersion': 1, 'providerKey': 'reddit', 'image': 'sha256:' + 'c' * 64,
            'scope': {k: f'00000000-0000-7000-8000-{i:012d}' for i, k in enumerate(
                ('tenantId', 'workspaceId', 'interestId', 'sourceBindingId', 'scanPolicyId'), 1)},
            'bindingConfig': '{}', 'scanPolicy': {'id': '00000000-0000-7000-8000-000000000005', 'intervalSeconds': 60, 'freshnessSeconds': 60, 'retryBudget': 0}, 'matchedLaneOrdinal': 1,
            'partitions': [part]}


class NativeAdmissionTests(unittest.TestCase):
    def test_unsealed_shell_refuses_without_runtime_commands(self):
        command = 'state=/nonexistent; source "$1"; reddit_archive_import_init ' + 'a' * 64
        result = subprocess.run(['bash', '-c', command, 'contract', str(ROOT / 'social-monitor-posts-reddit-archive-import.sh')], capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)

    def test_entrypoint_rejects_invalid_boundary_before_secret_reads(self):
        for args in ([], ['bad'] * 6):
            result = subprocess.run(['sh', str(ROOT / 'entrypoint.sh'), *args], capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 78)
            self.assertEqual(result.stdout, b'')

    def test_unsealed_source_never_admits(self):
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            module.validate_attempt({}, [], '', '', 0)

    def test_explicit_complete_profile(self):
        value = fixture()
        self.assertEqual(module.selected(value, 'a' * 64)['selectedIds'], ['reddit:t3_abcd'])

    def test_missing_or_foreign_scope_refused(self):
        for field in fixture()['scope']:
            value = fixture()
            del value['scope'][field]
            with self.subTest(field=field), self.assertRaises(ValueError):
                module.selected(value, 'a' * 64)

    def test_no_provider_or_provenance_piggyback(self):
        for key, value in [('providerKey', 'github-trending-page'), ('matchedLaneOrdinal', 0),
                           ('bindingConfig', ''), ('scanPolicy', None)]:
            profile = fixture()
            profile[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                module.selected(profile, 'a' * 64)

    def test_config_change_duplicate_identity_and_escape_refused(self):
        for mutation in ('config', 'duplicate', 'escape', 'foreign_id', 'key'):
            value = fixture()
            part = value['partitions'][0]
            if mutation == 'config':
                value['bindingConfig'] = '{"changed":true}'
            elif mutation == 'duplicate':
                part['selectedIds'] *= 2
            elif mutation == 'escape':
                part['inputHostRoot'] += '/../foreign'
            elif mutation == 'foreign_id':
                part['selectedIds'] = ['github:abc']
            else:
                part['semanticKey'] = 'd' * 64
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                module.selected(value, 'a' * 64)

    def test_intent_requires_exact_mode_and_date_and_no_duplicate_fields(self):
        value = fixture()
        attempt = '20261016T000000Z-00000000-0000-4000-8000-000000000001'
        fields = {'mode': module.MODE, 'date': '2026-09-20', 'artifact':
                  'reddit-archive-import-20260920-' + 'a' * 12 + '-' + attempt.split('-', 1)[1],
                  'image': value['image'], 'before': '10,10', 'watchdog': 'social-posts-wd-' + attempt.split('-', 1)[1],
                  'credential_deadline': '2026-10-16T00:30:00Z', 'import': 'a' * 64,
                  'plan_sha256': 'b' * 64, 'claim_sha256': 'e' * 64}
        module.validate_with_profile(value, fields, list(fields.items()), attempt,
                                     fields['credential_deadline'], 1792108800)
        for key in ('mode', 'date', 'plan_sha256', 'image'):
            bad = copy.deepcopy(fields)
            bad[key] = 'foreign'
            with self.subTest(key=key), self.assertRaises(ValueError):
                module.validate_with_profile(value, bad, list(bad.items()), attempt,
                                             fields['credential_deadline'], 1792108800)
        with self.assertRaises(ValueError):
            module.validate_with_profile(value, fields, list(fields.items()) + [('mode', module.MODE)],
                                         attempt, fields['credential_deadline'], 1792108800)


if __name__ == '__main__':
    unittest.main()
