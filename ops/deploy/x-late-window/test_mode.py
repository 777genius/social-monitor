import json
import subprocess
from pathlib import Path

MODE = Path(__file__).with_name('mode.sh')


def shell(body):
    return subprocess.run(['bash', '-c', 'source "$1"; ' + body, '_', str(MODE)],
                          capture_output=True, text=True)


def test_future_segments_and_native_one_shot_prior_claim():
    result = shell('today=2026-11-14; x_late_init 2026-11-13; '
                   '[[ $day == 2026-11-13 && $x_late_hour == 21 ]] && '
                   'x_late_prior_allows current-slot 2026-11-13 && '
                   '! x_late_prior_allows historical-x-late 2026-11-13 && '
                   '! x_late_prior_allows unrecognized 2026-11-13')
    assert result.returncode == 0, result.stderr


def test_rejects_unlisted_or_open_day():
    assert shell('today=2026-11-14; ! x_late_init 2026-11-06').returncode == 0
    assert shell('today=2026-11-13; ! x_late_init 2026-11-13').returncode == 0


def test_partial_artifact_scope_and_window(tmp_path):
    path = tmp_path / 'report.json'
    report = {'schemaVersion': 1, 'artifactFormat': 'reader-summary-clean-real-day-collection-v1',
              'generatedBy': 'npm run run:reader-summary-clean-real-day-collection',
              'run': {'collectionDate': '2026-11-13'}, 'blockingPassed': False,
              'inputs': {'scope': {'tenantId': '00000000-0000-7000-8000-000000006101', 'workspaceId': '00000000-0000-7000-8000-000000006102'}, 'coverage': 'PARTIAL_PROVIDER_WINDOW', 'providerKeys': ['x-twitter'],
                         'targetPublishedWindow': {'startInclusive': '2026-11-13T21:00:00.000Z',
                                                   'endExclusive': '2026-11-14T00:00:00.000Z'}},
              'model': {'liveNetwork': True, 'liveNetworkProviderKeys': ['x-twitter'], 'rawProviderPayloadPersistedInReport': False,
                        'rawPostTextPersistedInReport': False, 'rawProviderConfigPersistedInReport': False},
              'qualityGates': {'noRawSecretFragments': True}, 'scans': [{'providerKey': 'x-twitter', 'status': 'succeeded', 'attemptCount': 1}]}
    path.write_text(json.dumps(report))
    body = f'date() {{ printf "2026-11-14\\n"; }}; day=2026-11-13; x_late_hour=21; x_late_partial_artifact "{path}"'
    assert shell(body).returncode == 0
    report['inputs']['providerKeys'].append('reddit')
    path.write_text(json.dumps(report))
    assert shell(body).returncode != 0
