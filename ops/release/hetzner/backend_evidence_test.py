"""No human approval is fabricated by the cohort's automatic CI policy."""
import copy
import unittest
from unittest.mock import patch
from contract import Denied, digest
from evidence import PACKAGE_BUILD, PACKAGE_CHECK, backend_compatibility
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

    def test_operator_observes_the_same_immutable_delta_once(self):
        class Config:
            recheck = lambda self: None
        binding = {'sha': SHA, 'ci_run_id': '123', 'api_revision': BASE,
                   'worker_revision': BASE, 'non_target_snapshot_sha256': SNAPSHOT}
        with patch.object(GitHub, 'main', return_value=SHA), \
             patch.object(GitHub, 'legacy', return_value='disabled_manually'), \
             patch.object(GitHub, 'run', return_value={'run_attempt': 1}), \
             patch.object(GitHub, 'jobs', return_value=[{'conclusion': 'success'}]), \
             patch.object(GitHub, 'delta', return_value=(['apps/api/src/main.ts'], 'sha256:' + 'f' * 64)) as delta:
            result = backend_release(Config(), object(), binding)
            delta.assert_called_once_with(BASE, SHA)
            self.assertEqual(result['deltas']['api'], result['deltas']['jev-intelligence-worker'])


    def test_exact_host_package_proof_is_required_and_cannot_open_other_build_inputs(self):
        value = evidence(['package.json', 'scripts/lib/source-live-smoke-script-contracts.mjs'])
        package = {'base': BASE, 'head': SHA, 'delta_sha256': 'sha256:' + 'd' * 64,
                   'changed_scripts': [PACKAGE_CHECK], 'before_blob': '1' * 40, 'after_blob': '2' * 40,
                   'before_sha256': 'sha256:' + '3' * 64, 'after_sha256': 'sha256:' + '4' * 64,
                   'build_contract_sha256': digest(PACKAGE_BUILD)}
        for delta in value['deltas'].values(): delta['package_scripts'] = copy.deepcopy(package)
        proof = backend_compatibility(value, REVISIONS, SHA, SNAPSHOT)
        self.assertEqual(proof['deltas'], value['deltas'])
        for service in TARGETS:
            for change in ({'base': SHA}, {'head': BASE}, {'delta_sha256': SNAPSHOT},
                           {'changed_scripts': []}, {'changed_scripts': [PACKAGE_CHECK, 'build']},
                           {'changed_scripts': [PACKAGE_CHECK, PACKAGE_CHECK]}, {'changed_scripts': ['check:']},
                           {'build_contract_sha256': SNAPSHOT}, {'before_blob': 'not-a-hash'},
                           {'before_sha256': 'not-a-hash'}, {'extra': True}):
                candidate = copy.deepcopy(value); candidate['deltas'][service]['package_scripts'].update(change)
                with self.subTest(service=service, change=change), self.assertRaises(Denied):
                    backend_compatibility(candidate, REVISIONS, SHA, SNAPSHOT)
            candidate = copy.deepcopy(value); candidate['deltas'][service].pop('package_scripts')
            candidate['package_scripts'] = package  # A top-level assertion is not per-base host proof.
            with self.assertRaises(Denied): backend_compatibility(candidate, REVISIONS, SHA, SNAPSHOT)
            for path in ('vendor/x/file.js', '.npmrc', '.dockerignore', 'binding.gyp', 'tsconfig.json',
                         'prisma.config.ts', 'scripts/unknown-build-input.ts', 'scripts/run-with-timeout.mjs',
                         'scripts/rewrite-build-aliases.mjs', 'package-lock.json',
                         'libs/summary/index.ts', 'apps/api-gateway/src/main.ts', 'prisma/schema.prisma'):
                candidate = copy.deepcopy(value); candidate['deltas'][service]['changed_paths'].append(path)
                with self.subTest(service=service, path=path), self.assertRaises(Denied):
                    backend_compatibility(candidate, REVISIONS, SHA, SNAPSHOT)

    def test_legacy_no_package_compatibility_bytes_are_unchanged(self):
        value = evidence(['apps/api-gateway/src/main.ts'])
        expected = {'policy': 'backend-cohort-ci-v1', 'deltas': value['deltas'],
                    'run_attempt': 1, 'jobs_sha256': digest(['qualified'])}
        self.assertEqual(backend_compatibility(value, REVISIONS, SHA, SNAPSHOT), expected)


    def test_multiple_check_scripts_allow_only_regular_non_image_ci_path_families(self):
        from operator_github_test import Fixture, package, BASE as OLD, HEAD as NEW
        from contract import canonical
        old = package(); new = copy.deepcopy(old)
        new['scripts'][PACKAGE_CHECK] = 'node TEST-new.mjs'
        new['scripts']['check:release-artifact-evidence'] = 'node TEST-release.mjs'
        fixture = Fixture(canonical(old), canonical(new)); package_proof = fixture.proof()
        value = evidence(['package.json', 'scripts/check-release-artifact-evidence.mjs',
            'scripts/lib/release-deploy-artifact-path-smokes.mjs',
            'scripts/lib/release-deploy-artifact-path-smokes.test.mjs',
            'scripts/ci/new-proof.test.mts', 'ops/ci/new-proof.test.mts', 'docs/new.md', 'ops/release/hetzner/new.py'])
        value.update(main_sha=NEW, head_sha=NEW, api_revision=OLD, worker_revision=OLD)
        for delta in value['deltas'].values():
            delta.update(base=OLD, head=NEW, delta_sha256=package_proof['delta_sha256'], package_scripts=package_proof)
        revisions = {service: OLD for service in TARGETS}
        self.assertEqual(backend_compatibility(value, revisions, NEW, SNAPSHOT)['deltas'], value['deltas'])
        for path in ('vendor/new.mjs', 'libs/new.mjs', 'apps/api-gateway/new.mjs', 'ops/deploy/new.mjs',
                     'scripts/quickstart/new.ts', 'scripts/run-with-timeout.mjs', 'scripts/rewrite-build-aliases.mjs',
                     'scripts/lib/.env', '.dockerignore', '.npmrc', 'tsconfig.json'):
            candidate = copy.deepcopy(value)
            candidate['deltas']['api']['changed_paths'].append(path)
            with self.subTest(path=path), self.assertRaises(Denied):
                backend_compatibility(candidate, revisions, NEW, SNAPSHOT)
