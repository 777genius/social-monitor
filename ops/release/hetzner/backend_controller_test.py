"""Cohort crash/replay risks, using synthetic containers and no model/network calls."""
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contract import Denied, atomic, digest, read_json, require, parse
from backend_controller import BackendRelease
from backend_host import BackendHost, TARGETS
from worker_host import SERVICE

SHA, OLD_SHA, RUN = 'a' * 40, 'b' * 40, '123'
IMAGE, OLD_IMAGE = 'sha256:' + 'c' * 64, 'sha256:' + 'd' * 64
KEY = SHA + '-' + RUN
RESTART = {'Name': 'unless-stopped', 'MaximumRetryCount': 0}


class Docker:
    def __init__(self):
        self.values = {s: {'Id': str(i) * 64, 'Image': OLD_IMAGE,
            'Config': {'Env': ['INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=true', 'JEV=unchanged']},
            'HostConfig': {'RestartPolicy': RESTART.copy()}, 'Mounts': [], 'RestartCount': 0,
            'State': {'Running': True, 'ExitCode': 0, 'OOMKilled': False, 'StartedAt': 'start'}}
            for i, s in enumerate(TARGETS, 1)}
        self.effects, self.healthy, self.marker = [], True, True
        self.evidence_calls = []
        self.stale_main = False
        self.protected = {'postgres': 'untouched', 'credential-watchdog': 'running'}
        self.next_id, self.fail_up_before, self.fail_up_after, self.two = 3, False, False, False

    def compose_fingerprint(self):
        return 'compose'

    def evidence(self, verb, binding):
        self.evidence_calls.append(verb)
        if verb in ('backend-release-evidence', 'cohort-backend-release-evidence'):
            paths = ['apps/intelligence-worker/src/reader-value-runtime-options.ts', 'compose.frontend.yml']
            return {**binding, 'policy': 'backend-cohort-ci-v1', 'main_sha': OLD_SHA if self.stale_main else SHA, 'head_sha': SHA,
                'event': 'push', 'branch': 'main', 'jobs': ['success'], 'job_observations': ['ci'],
                'run_attempt': 1, 'legacy_workflow': 'disabled_manually',
                'deltas': {s: {'base': OLD_SHA, 'head': SHA, 'complete_delta': True,
                    'changed_paths': paths, 'delta_sha256': 'sha256:' + '0' * 64} for s in TARGETS}}
        if verb == 'worker-capability':
            return {'supported': self.marker, 'service': SERVICE, 'signal_replay': 'nest-guarded-v1'}
        if verb == 'worker-drain':
            v = self.values[SERVICE]
            require(self.marker and not v['State']['OOMKilled'] and v['State']['ExitCode'] in (0, 143),
                    'worker-drain-marker')
            return {**binding, 'drained': True, 'service': SERVICE}
        raise AssertionError(verb)

    def retain(self, images):
        pass

    def import_image(self, archive, admission):
        self.effects.append('import')


class Cohort:
    def __init__(self, docker):
        self.docker, self.worker, self.roots_valid = docker, self, True

    policy = staticmethod(BackendHost.policy)

    def snapshot(self, complete=True):
        require(not self.docker.two, 'backend-target-count')
        require(not complete or set(self.docker.values) == set(TARGETS), 'backend-target-count')
        return copy.deepcopy(self.docker.protected), {s: {'service': s, 'id': v['Id'],
            'image': v['Image'], 'running': v['State']['Running']} for s, v in self.docker.values.items()}

    def inspect(self, target):
        value = self.docker.values[target['service']]
        require(value['Id'] == target['id'], 'wrong-id')
        return copy.deepcopy(value)

    def roots_match(self, values):
        require(self.roots_valid, 'backend-runtime-roots-drift')

    assert_runtime_model = lambda self, values, key: self.roots_match(values)
    configured_restart = lambda self: RESTART.copy()
    signal_ready = lambda self, value: value['State']['Running']
    created_after = lambda self, value, intent: require(value.get('our_create') is True, 'backend-recreation-time')

    def restart(self, ident, policy):
        require(self.docker.values[SERVICE]['Id'] == ident, 'wrong-worker')
        self.docker.effects.append('restart-no')
        self.docker.values[SERVICE]['HostConfig']['RestartPolicy'] = policy.copy()

    def term(self, ident):
        require(self.docker.values[SERVICE]['Id'] == ident, 'wrong-worker')
        self.docker.effects.append('term')

    def up(self, images, override, fingerprint, service):
        if self.docker.fail_up_before:
            self.docker.fail_up_before = False
            raise RuntimeError('before-up')
        self.docker.effects.append('up-' + service)
        v = self.docker.values[service]
        v['Image'], v['Id'] = images[service], str(self.docker.next_id) * 64
        self.docker.next_id += 1
        v['State']['Running'], v['our_create'] = True, True
        v['HostConfig']['RestartPolicy'] = RESTART.copy()
        if images[service] == OLD_IMAGE:
            v['Config']['Env'] = ['INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=true', 'JEV=unchanged']
        if self.docker.fail_up_after:
            self.docker.fail_up_after = False
            raise RuntimeError('after-up')

    def start_created(self, target, value):
        self.docker.effects.append('start-' + target['service'])
        self.docker.values[target['service']]['State']['Running'] = True

    def ready(self, target, admission, image, revision):
        return self.docker.healthy and target['running'] and target['image'] == image


class Core:
    def __init__(self, root, docker):
        self.state, self.host = root, docker
        self.c = {'migration_root': '/app/prisma/migrations'}
        self.database_calls, self.changed = 0, False

    exclusive = lambda self, key: None
    binding = lambda self, item: {k: item[k] for k in ('sha', 'ci_run_id', 'archive_sha256', 'image_id')}
    previous_revision = lambda self, image: OLD_SHA
    backup = lambda self, item: {'verified': True}

    def database(self, item):
        self.database_calls += 1
        require(not self.changed, 'migration-required')
        return {'history': 'unchanged'}

    def retained_database(self, admission, value):
        require(value == admission['database'], 'database-changed')


class CohortTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.docker = Docker()
        self.core = Core(self.root, self.docker)
        self.release = BackendRelease(self.core)
        self.release.host = Cohort(self.docker)
        for name in ('admissions', 'transactions', 'receipts', 'inbox', 'overrides'):
            (self.release.root / name).mkdir(parents=True, exist_ok=True)
        self.admission = {'sha': SHA, 'ci_run_id': RUN, 'archive_sha256': 'sha256:' + 'e' * 64,
            'image_id': IMAGE, 'previous_image_ids': {s: OLD_IMAGE for s in TARGETS},
            'previous_revisions': {s: OLD_SHA for s in TARGETS},
            'snapshot_sha256': digest(self.docker.protected),
            'runtime_sha256': {s: self.release.host.policy(v, s) for s, v in self.docker.values.items()},
            'restart_policy': RESTART.copy(), 'compose_hash': 'compose', 'database': {'history': 'unchanged'}}
        self.admission['compatibility'] = self.release.evidence(self.admission,
            self.admission['previous_revisions'], self.admission['snapshot_sha256'])
        atomic(self.release.path('admissions', KEY), self.admission)
        self.archive = patch('backend_controller.inspect_archive', return_value={})
        self.archive.start()

    def tearDown(self):
        self.archive.stop()
        self.temp.cleanup()

    def drained(self):
        self.docker.values[SERVICE]['State'].update(Running=False, ExitCode=143)

    def activate(self):
        self.assertEqual(self.release.activate(KEY)['phase'], 'draining')
        self.drained()
        return self.release.activate(KEY)

    def test_two_target_activation_and_receipt(self):
        receipt = self.activate()
        self.assertEqual(receipt['outcome'], 'activated')
        self.assertEqual(receipt['active_image_ids'], {s: IMAGE for s in TARGETS})
        self.assertEqual(self.docker.effects, ['import', 'restart-no', 'term', 'up-api', 'up-' + SERVICE])
        self.assertEqual(self.release.activate(KEY), receipt)

    def test_signal_intent_uncertainty_recovers_with_guarded_replay(self):
        original = self.release.host.term
        with patch.object(self.release.host, 'term', side_effect=RuntimeError('lost-before-signal')):
            with self.assertRaises(RuntimeError): self.release.activate(KEY)
        self.assertEqual(self.release.activate(KEY)['phase'], 'draining')
        self.assertEqual(self.docker.effects.count('term'), 1)
        self.assertFalse(any(v.startswith('up-') for v in self.docker.effects))
        self.release.host.term = original

    def test_bare_143_without_marker_never_starts(self):
        self.release.activate(KEY); self.drained(); self.docker.marker = False
        with self.assertRaisesRegex(Denied, 'worker-drain-marker'): self.release.activate(KEY)
        self.assertFalse(any(v.startswith('up-') for v in self.docker.effects))

    def test_oom_never_starts(self):
        self.release.activate(KEY); self.drained(); self.docker.values[SERVICE]['State']['OOMKilled'] = True
        with self.assertRaises(Denied): self.release.activate(KEY)

    def test_crash_before_up_reconciles_without_duplicate_signal(self):
        self.release.activate(KEY); self.drained(); self.docker.fail_up_before = True
        with self.assertRaisesRegex(RuntimeError, 'before-up'): self.release.activate(KEY)
        self.assertEqual(self.release.activate(KEY)['outcome'], 'activated')
        self.assertEqual(self.docker.effects.count('term'), 1)

    def test_crash_after_up_recovers_created_id(self):
        self.release.activate(KEY); self.drained(); self.docker.fail_up_after = True
        with self.assertRaisesRegex(RuntimeError, 'after-up'): self.release.activate(KEY)
        self.assertEqual(self.release.activate(KEY)['outcome'], 'activated')
        self.assertEqual(self.docker.effects.count('up-api'), 1)

    def test_crash_after_create_before_start_starts_exact_id(self):
        self.release.activate(KEY); self.drained(); self.docker.fail_up_after = True
        with self.assertRaises(RuntimeError): self.release.activate(KEY)
        ident = self.docker.values['api']['Id']
        self.docker.values['api']['State'].update(Running=False, Status='created')
        self.assertEqual(self.release.activate(KEY)['outcome'], 'activated')
        self.assertEqual(self.docker.values['api']['Id'], ident)
        self.assertEqual(self.docker.effects.count('up-api'), 1)
        self.assertEqual(self.docker.effects.count('start-api'), 1)

    def test_missing_marker_capability_refuses_before_any_signal(self):
        self.docker.marker = False
        with self.assertRaisesRegex(Denied, 'worker-drain-capability-missing'): self.release.activate(KEY)
        self.assertNotIn('term', self.docker.effects)
        self.assertNotIn('restart-no', self.docker.effects)

    def test_duplicate_container_is_refused(self):
        self.release.activate(KEY); self.drained(); self.docker.two = True
        with self.assertRaisesRegex(Denied, 'backend-target-count'): self.release.activate(KEY)

    def test_missing_before_intent_is_not_blindly_recreated(self):
        self.release.activate(KEY); self.drained()
        with patch.object(self.release.host, 'up', side_effect=RuntimeError('before-up')):
            with self.assertRaises(RuntimeError): self.release.activate(KEY)
        del self.docker.values[SERVICE]
        with self.assertRaisesRegex(Denied, 'backend-container-disappeared'): self.release.activate(KEY)

    def test_runtime_pause_or_jev_drift_refused_before_effect(self):
        self.docker.values[SERVICE]['Config']['Env'] = ['INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=false']
        with self.assertRaisesRegex(Denied, 'backend-runtime-changed'): self.release.activate(KEY)
        self.assertEqual(self.docker.effects, [])

    def test_untrusted_overlay_refused_before_effect(self):
        self.release.host.roots_valid = False
        with self.assertRaisesRegex(Denied, 'backend-runtime-roots-drift'): self.release.activate(KEY)
        self.assertEqual(self.docker.effects, [])

    def test_non_target_drift_refused(self):
        self.docker.protected['postgres'] = 'replaced'
        with self.assertRaisesRegex(Denied, 'backend-non-target-changed'): self.release.activate(KEY)

    def test_api_restart_policy_drift_refused(self):
        self.docker.values['api']['HostConfig']['RestartPolicy']['Name'] = 'no'
        with self.assertRaisesRegex(Denied, 'backend-runtime-changed'): self.release.activate(KEY)

    def test_schema_drift_after_drain_refused(self):
        self.release.activate(KEY); self.drained(); self.core.changed = True
        with self.assertRaisesRegex(Denied, 'migration-required'): self.release.activate(KEY)
        self.assertFalse(any(v.startswith('up-') for v in self.docker.effects))

    def test_receipt_publish_crash_reconciles_without_new_database_observation(self):
        self.release.activate(KEY); self.drained()
        def publish(path, value, immutable=False):
            atomic(path, value, immutable)
            if path.parent.name == 'receipts': raise RuntimeError('after-publish')
        with patch('backend_controller.atomic', side_effect=publish):
            with self.assertRaisesRegex(RuntimeError, 'after-publish'): self.release.activate(KEY)
        old = read_json(self.release.path('receipts', KEY))
        calls = self.core.database_calls
        self.assertEqual(self.release.activate(KEY), old)
        self.assertEqual(self.core.database_calls, calls)

    def test_successful_rollback_preserves_activation_receipt(self):
        receipt = self.activate()
        self.assertEqual(self.release.activate(KEY, rollback=True)['phase'], 'draining')
        self.drained()
        rolled = self.release.activate(KEY, rollback=True)
        self.assertEqual(rolled['outcome'], 'rolled-back')
        self.assertEqual(rolled['active_image_ids'], {s: OLD_IMAGE for s in TARGETS})
        self.assertEqual(read_json(self.release.path('receipts', KEY)), receipt)

    def test_rollback_after_api_recreated_before_worker_started(self):
        self.release.activate(KEY); self.drained()
        original = self.release.host.up
        def fail_worker(images, override, fingerprint, service):
            if service == SERVICE: raise RuntimeError('before-worker')
            return original(images, override, fingerprint, service)
        with patch.object(self.release.host, 'up', side_effect=fail_worker):
            with self.assertRaises(RuntimeError): self.release.activate(KEY)
        rolled = self.release.activate(KEY, rollback=True)
        self.assertEqual(rolled['outcome'], 'rolled-back')
        self.assertEqual(self.docker.effects.count('term'), 1)

    def test_runtime_incompatible_exact_candidate_can_be_rolled_back(self):
        self.activate()
        self.docker.values['api']['Config']['Env'].append('NODE_VERSION=other')
        self.docker.values[SERVICE]['Config']['Env'].append('NODE_VERSION=other')
        with self.assertRaisesRegex(Denied, 'backend-runtime-changed'): self.release.activate(KEY)
        self.assertEqual(self.release.activate(KEY, rollback=True)['phase'], 'draining')
        self.drained()
        receipt = self.release.activate(KEY, rollback=True)
        self.assertEqual(receipt['outcome'], 'rolled-back')
        self.release.observe(self.admission)

    def test_rollback_crash_after_old_create_and_before_id_journal_recovers_drift(self):
        self.activate()
        for value in self.docker.values.values(): value['Config']['Env'].append('NODE_VERSION=other')
        self.release.activate(KEY, rollback=True); self.drained(); self.docker.fail_up_after = True
        with self.assertRaisesRegex(RuntimeError, 'after-up'): self.release.activate(KEY, rollback=True)
        old_api_id = self.docker.values['api']['Id']
        self.docker.values['api']['State'].update(Running=False, Status='created')
        receipt = self.release.activate(KEY, rollback=True)
        self.assertEqual(receipt['outcome'], 'rolled-back')
        self.assertEqual(self.docker.values['api']['Id'], old_api_id)
        self.assertEqual(self.docker.effects.count('start-api'), 1)
        self.release.observe(self.admission)

    def test_rollback_never_started_created_candidate_reuses_prior_drain_proof(self):
        self.release.activate(KEY); self.drained()
        original = self.release.host.up
        def create_worker_then_crash(images, override, fingerprint, service):
            original(images, override, fingerprint, service)
            if service == SERVICE:
                self.docker.values[SERVICE]['State'].update(Running=False, Status='created',
                                                            StartedAt='0001-01-01T00:00:00Z')
                raise RuntimeError('after-worker-create')
        with patch.object(self.release.host, 'up', side_effect=create_worker_then_crash):
            with self.assertRaisesRegex(RuntimeError, 'after-worker-create'): self.release.activate(KEY)
        receipt = self.release.activate(KEY, rollback=True)
        self.assertEqual(receipt['outcome'], 'rolled-back')
        self.assertEqual(self.docker.effects.count('term'), 1)

    def test_failed_exited_candidate_is_not_treated_as_never_started(self):
        self.release.activate(KEY); self.drained()
        original = self.release.host.up
        def failed_worker(images, override, fingerprint, service):
            original(images, override, fingerprint, service)
            if service == SERVICE:
                self.docker.values[SERVICE]['State'].update(Running=False, Status='exited', ExitCode=1)
                raise RuntimeError('worker-failed')
        with patch.object(self.release.host, 'up', side_effect=failed_worker):
            with self.assertRaises(RuntimeError): self.release.activate(KEY)
        with self.assertRaisesRegex(Denied, 'worker-drain-bootstrap'):
            self.release.activate(KEY, rollback=True)

    def test_stale_main_before_first_effect_refused(self):
        self.docker.stale_main = True
        with self.assertRaisesRegex(Denied, 'backend-ci'): self.release.activate(KEY)
        self.assertEqual(self.docker.effects, [])

    def test_startup_recovery_reuses_durable_ci_proof_without_github_polling(self):
        self.release.activate(KEY)
        calls = self.docker.evidence_calls.count('backend-release-evidence')
        self.docker.stale_main = True
        self.drained(); self.docker.healthy = False
        self.assertEqual(self.release.activate(KEY)['phase'], 'starting')
        self.assertEqual(self.release.activate(KEY)['phase'], 'starting')
        self.assertEqual(self.docker.evidence_calls.count('backend-release-evidence'), calls)
        self.docker.healthy = True
        self.assertEqual(self.release.activate(KEY)['outcome'], 'activated')
        self.assertEqual(self.docker.evidence_calls.count('backend-release-evidence'), calls)

    def test_new_namespace_preserves_legacy_grammar(self):
        for verb in ('activate', 'admit', 'rollback', 'verify'):
            self.assertEqual(parse(f'backend-{verb} {SHA} {RUN}'), ('backend-' + verb, [SHA, RUN]))
            self.assertEqual(parse(f'{verb} {SHA} {RUN}'), (verb, [SHA, RUN]))
