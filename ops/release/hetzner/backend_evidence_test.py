"""No human approval is fabricated by the cohort's automatic CI policy."""
import copy
import unittest
from unittest.mock import patch
from contract import Denied, digest
from evidence import backend_compatibility
from operator_github import backend_release, GitHub
from backend_host import TARGETS

SHA, BASE, SNAPSHOT = 'a' * 40, 'b' * 40, 'sha256:' + 'c' * 64
REVISIONS = {s: BASE for s in TARGETS}


def evidence(paths):
    return {'policy': 'backend-cohort-ci-v1', 'main_sha': SHA, 'head_sha': SHA,
        'api_revision': BASE, 'worker_revision': BASE, 'non_target_snapshot_sha256': SNAPSHOT,
        'event': 'push', 'branch': 'main', 'legacy_workflow': 'disabled_manually',
        'jobs': ['success'], 'job_observations': ['qualified'], 'run_attempt': 1,
        'deltas': {s: {'base': BASE, 'head': SHA, 'complete_delta': True,
                      'changed_paths': paths, 'delta_sha256': 'sha256:' + 'd' * 64} for s in TARGETS}}


class CohortEvidenceTests(unittest.TestCase):
    def test_target_app_and_frontend_overlay_allowed_without_manual_review(self):
        value = evidence(['apps/intelligence-worker/src/reader-value-runtime-options.ts', 'apps/api-gateway/src/controller.ts',
                          'compose.frontend.yml', 'apps/frontend/app/lib/main.dart'])
        proof = backend_compatibility(value, REVISIONS, SHA, SNAPSHOT)
        self.assertEqual(proof['policy'], 'backend-cohort-ci-v1')
        self.assertNotIn('independent_review', str(proof))

    def test_schema_and_untouched_service_changes_refused_from_either_base(self):
        for path in ('prisma/schema.prisma', 'apps/ingestion-worker/src/main.ts',
                     'apps/agent-runtime/src/main.ts', 'apps/x-collector/src/main.ts',
                     'libs/agent-runtime/app.ts', 'any/prisma/migrations/x/migration.sql',
                     'libs/monitoring/features/collect.ts', 'libs/ingestion/domain/post.ts',
                     'libs/platform/queue/port.ts', 'libs/delivery/contract.ts', 'libs/platform/events/event.ts',
                     'libs/summary/features/generate.ts', 'libs/relevance/domain/score.ts',
                     'libs/shared-kernel/id.ts', 'libs/new-shared-context/contract.ts', 'package-lock.json', 'package.json', 'scripts/rewrite-build-aliases.mjs', 'Dockerfile',
                     'apps/intelligence-worker/src/main.ts',
                     'apps/intelligence-worker/src/worker-shutdown-marker.ts'):
            for service in TARGETS:
                value = evidence(['apps/api/src/main.ts'])
                value['deltas'][service]['changed_paths'] = [path]
                with self.subTest(path=path, service=service), self.assertRaisesRegex(Denied, 'backend-sensitive'):
                    backend_compatibility(value, REVISIONS, SHA, SNAPSHOT)

    def test_missing_second_base_stale_main_and_incomplete_ci_refused(self):
        for mutate in (lambda v: v['deltas'].pop('api'), lambda v: v.update(main_sha=BASE),
                       lambda v: v.update(jobs=['success', 'failure']),
                       lambda v: v['deltas']['api'].update(complete_delta=False)):
            value = evidence(['apps/api/src/main.ts']); mutate(value)
            with self.assertRaises(Denied): backend_compatibility(value, REVISIONS, SHA, SNAPSHOT)

    def test_operator_collects_each_running_revision_and_rechecks_ci(self):
        class Config:
            recheck = lambda self: None
        binding = {'sha': SHA, 'ci_run_id': '123', 'api_revision': BASE,
                   'worker_revision': 'e' * 40, 'non_target_snapshot_sha256': SNAPSHOT}
        with patch.object(GitHub, 'main', return_value=SHA), \
             patch.object(GitHub, 'legacy', return_value='disabled_manually'), \
             patch.object(GitHub, 'run', return_value={'run_attempt': 1}), \
             patch.object(GitHub, 'jobs', return_value=[{'conclusion': 'success'}]), \
             patch.object(GitHub, 'delta', return_value=(['apps/api/src/main.ts'], 'sha256:' + 'f' * 64)) as delta:
            result = backend_release(Config(), object(), binding)
            self.assertEqual([call.args for call in delta.call_args_list], [(BASE, SHA), ('e' * 40, SHA)])
            self.assertEqual(result['api_revision'], BASE)
