"""Three-target journal tests. All CI, SQL, Docker and HTTP observations are synthetic."""
import copy
import hashlib
import json
import shutil
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend_controller_test import Docker, Core, Cohort as WorkerSeam, SHA, OLD_SHA, RUN, IMAGE, OLD_IMAGE, KEY, RESTART
from cohort_controller import CohortRelease
from cohort_host import CohortHost, TARGETS
import cohort_compose
from contract import Denied, atomic, digest, read_json, require
from frontend_bundle_test import files
from frontend_host import MOUNTS
from frontend_tree import tree_digest
from worker_host import SERVICE, WorkerHost

FRONT_IMAGE = 'sha256:' + 'f' * 64


def checksum(path):
    return 'sha256:' + hashlib.sha256(Path(path).read_bytes()).hexdigest()


class Runtime(Docker):
    def __init__(self, sources):
        super().__init__()
        self.c = {'project': 'test-cohort-controller', 'compose_files': ['/trusted/base.json']}
        self.values['frontend'] = copy.deepcopy(self.values['api'])
        self.values[SERVICE]['Config']['Env'] += [
            'INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER=disabled',
            'INTELLIGENCE_AUTO_SUMMARY_SCHEDULER=disabled', 'READER_VALUE_MODE=jev_primary_v3']
        self.values['frontend'].update(Id='3' * 64, Image=FRONT_IMAGE)
        self.values['frontend']['HostConfig']['ReadonlyRootfs'] = True
        self.next_id = 4
        for index, (service, value) in enumerate(self.values.items(), 1):
            value['State']['Pid'] = 100 + index
            value['Config']['Labels'] = {'com.docker.compose.project': self.c['project'],
                'com.docker.compose.service': service, 'com.docker.compose.project.config_files': '/trusted/base.json',
                'com.docker.compose.config-hash': '0' * 64}
        self.mount(self.values['frontend'], sources)
        self.base = {'services': {s: {'image': 'nginx:trusted' if s == 'frontend' else OLD_IMAGE} for s in TARGETS}}
        self.base['services']['frontend']['volumes'] = [{'type': 'bind', 'target': target,
            'source': source, 'read_only': True} for target, source in sources.items()]
        self.retagged, self.front_ready = False, True
        self.fail_service, self.fail_when = None, None
        self.reuse_worker = False

    @staticmethod
    def mount(value, sources):
        value['Mounts'] = [{'Type': 'bind', 'Source': source, 'Destination': target,
                            'RW': False, 'Mode': 'ro'} for target, source in sources.items()]
        value['HostConfig']['Binds'] = [source + ':' + target + ':ro' for target, source in sources.items()]

    def snapshot(self, target_services=None, allow_missing_targets=False):
        require(not self.two, 'cohort-target-count')
        return copy.deepcopy(self.protected), [{'service': s, 'project': self.c['project'],
            'id': v['Id'], 'image': v['Image'], 'running': v['State']['Running']} for s, v in self.values.items()]

    def docker(self, *args):
        if args[:3] == ('image', 'inspect', '--format'):
            return ((IMAGE if self.retagged else FRONT_IMAGE) + '\n').encode()
        if args[0] == 'inspect':
            value = next(v for v in self.values.values() if v['Id'] == args[1])
            return json.dumps([value]).encode()
        if args[0] == 'start':
            value = next(v for v in self.values.values() if v['Id'] == args[1])
            value['State'].update(Running=True, Status='running', StartedAt='start')
            self.effects.append('start-' + value['Config']['Labels']['com.docker.compose.service'])
            return b''
        raise AssertionError(args)

    def model(self, path=None):
        result = copy.deepcopy(self.base)
        if path is not None:
            for service, fields in json.loads(Path(path).read_text())['services'].items():
                result['services'][service].update(fields)
        return result

    def compose(self, path):
        return ['docker', 'compose', '-f', str(path)]

    def command(self, args):
        require(args[-2] == '--hash', 'unexpected-command')
        return (args[-1] + ' ' + '0' * 64 + '\n').encode()

    def probe(self, image, sha):
        return self.healthy and self.values['api']['State']['Running'] and self.values['api']['Image'] == image

    def evidence(self, verb, binding):
        if verb == 'cohort-worker-probe-v1':
            value = self.values[SERVICE]
            return {'ready': self.healthy and value['State']['Running'] and value['Image'] == binding['image_id'] and
                        digest(value['HostConfig']['RestartPolicy']) == binding['restart_policy_sha256'],
                    'service': SERVICE}
        return super().evidence(verb, binding)

    def frontend_probe(self, binding):
        if not self.front_ready: return {'ready': False}
        return {**binding, 'ready': True, 'service': 'frontend', 'public_root_status': 200,
            'public_favicon_status': 200, 'public_release_sha': binding['public_sha'],
            'admin_root_status': 401, 'mounted_admin_sha': binding['admin_sha']}


class LiveHost(CohortHost):
    def __init__(self, host, root):
        super().__init__(host, root)
        self.worker = WorkerSeam(host)

    def current_sources(self, target, path=None):
        value = self.inspect(target)
        require(value['State']['Running'], 'synthetic-frontend-stopped')
        sources = {m['Destination']: m['Source'] for m in value['Mounts']}
        return {'sources': sources, 'verifier_sha256': checksum(sources['/run/bootstrap/verify-static-release.sh'])}

    def up(self, images, sources, path, fingerprint, service):
        runtime = self.host
        document = cohort_compose.override(runtime.model(), images, sources)
        atomic(path, document)
        if runtime.fail_service == service and runtime.fail_when == 'before':
            runtime.fail_service = None; raise RuntimeError('before-up')
        runtime.effects.append('up-' + service)
        value = runtime.values[service]
        if service == SERVICE and runtime.reuse_worker and value['Image'] == images[SERVICE]:
            value['State'].update(Running=True, Status='running', StartedAt='2999-01-01T00:00:00Z')
            return  # Real Compose can start the same ID and keep restart=no.
        value.update(Id=f'{runtime.next_id:x}' * 64, Image=FRONT_IMAGE if service == 'frontend' else images[service],
                     Created='2999-01-01T00:00:00Z')
        runtime.next_id += 1
        value['State'].update(Running=True, Status='running', StartedAt='start', ExitCode=0)
        value['HostConfig']['RestartPolicy'] = RESTART.copy()
        value['Config']['Labels']['com.docker.compose.project.config_files'] = '/trusted/base.json,' + str(path)
        if service == 'frontend': runtime.mount(value, sources)
        if value['Image'] == OLD_IMAGE:
            value['Config']['Env'] = ['INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=true', 'JEV=unchanged']
            if service == SERVICE:
                value['Config']['Env'] += ['INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER=disabled',
                    'INTELLIGENCE_AUTO_SUMMARY_SCHEDULER=disabled', 'READER_VALUE_MODE=jev_primary_v3']
        if runtime.fail_service == service:
            runtime.fail_service = None
            if runtime.fail_when == 'created':
                value['State'].update(Running=False, Status='created', StartedAt='0001-01-01T00:00:00Z')
            raise RuntimeError('after-up')


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='TEST-cohort-engine-')
        self.root = Path(self.temp.name)
        self.old, self.new = self.root / 'old', self.root / 'new'
        for base, sha in ((self.old, OLD_SHA), (self.new, SHA)):
            for name, data in files().items():
                path = base / 'bundle' / name; path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data.replace(SHA.encode(), sha.encode()))
            (base / 'verify.sh').write_bytes(('trusted verifier ' + sha).encode())
        for path in (self.old / 'bundle/admin').iterdir():
            path.write_bytes(path.read_bytes().replace(OLD_SHA.encode(), b'e' * 40))
        self.previous = self.sources(self.old)
        self.desired = self.sources(self.new)
        self.runtime = Runtime(self.previous)
        self.core = Core(self.root, self.runtime)
        self.engine = self.fresh()
        self.item = {'sha': SHA, 'ci_run_id': RUN, 'image_id': IMAGE, 'archive_sha256': 'sha256:' + '1' * 64,
                     'archive_bytes': 9}
        self.archive = self.root / 'backend.tar'; self.archive.write_bytes(b'synthetic')
        self.proof = {'root': str(self.new / 'bundle'), 'authority': {'sha': SHA, 'ci_run_id': RUN, 'ci_run_attempt': '1',
            'artifact_id': '456', 'artifact_name': f'frontend-candidate-{SHA}-{RUN}-1',
            'artifact_sha256': 'sha256:' + '2' * 64, 'artifact_bytes': 100},
            'manifest_sha256': 'sha256:' + '3' * 64, 'archive_sha256': 'sha256:' + '4' * 64, 'archive_bytes': 90,
            'tree_sha256': tree_digest(self.new / 'bundle')}
        for name in ('cohort_controller', 'cohort_host', 'cohort_compose'):
            handle = patch(name + '.trusted', side_effect=lambda path, directory=False: Path(path))
            handle.start(); self.addCleanup(handle.stop)
        handle = patch('cohort_controller.private_file_digest', side_effect=checksum)
        handle.start(); self.addCleanup(handle.stop)
        handle = patch('cohort_controller.inspect_archive', return_value={})
        handle.start(); self.addCleanup(handle.stop)
        self.addCleanup(self.temp.cleanup)
        self.admission = self.admit()

    def sources(self, root):
        return {'/usr/share/nginx/public': str(root / 'bundle/public'), '/usr/share/nginx/admin': str(root / 'bundle/admin'),
                '/run/bootstrap/verify-static-release.sh': str(root / 'verify.sh')}

    def fresh(self, probe=True):
        engine = CohortRelease(self.core, self.runtime.frontend_probe if probe else None)
        engine.host = LiveHost(self.runtime, engine.root)
        return engine

    def admit(self, **changes):
        args = {'backend_item': self.item, 'frontend_proof': self.proof, 'desired_sources': self.desired,
                'backend_archive': self.archive, 'desired_verifier_sha256': checksum(self.new / 'verify.sh')}
        args.update(changes)
        return self.engine.admit(KEY, **args)

    def drained(self):
        self.runtime.values[SERVICE]['State'].update(Running=False, ExitCode=143)

    def activate(self):
        self.assertEqual(self.engine.activate(KEY)['phase'], 'draining')
        self.drained()
        return self.fresh().activate(KEY)

    def test_three_targets_activate_and_receipt_is_idempotent(self):
        receipt = self.activate()
        self.assertEqual(receipt['outcome'], 'activated')
        self.assertEqual(receipt['scope'], ['api', SERVICE, 'frontend'])
        self.assertEqual(receipt['active_sources'], self.desired)
        self.assertEqual(receipt['active_image_ids']['frontend'], FRONT_IMAGE)
        self.assertEqual(self.fresh().activate(KEY), receipt)
        self.assertEqual(self.runtime.effects, ['import', 'restart-no', 'term', 'up-api', 'up-' + SERVICE, 'up-frontend'])

    def test_missing_journal_with_either_retained_receipt_is_never_unstarted(self):
        self.activate()
        self.engine.path('transactions', KEY).unlink()
        before = list(self.runtime.effects)
        for suffix in ('', '-rollback'):
            if suffix:
                self.engine.path('receipts', KEY).rename(self.engine.path('receipts', KEY + suffix))
            for verb in ('activate', 'rollback'):
                with self.assertRaisesRegex(Denied, '^cohort-journal-missing$'):
                    getattr(self.fresh(), verb)(KEY)
                self.assertEqual(self.runtime.effects, before)

    def test_dangling_transaction_symlink_never_certifies_unstarted(self):
        path = self.engine.path('transactions', KEY)
        path.symlink_to(self.root / 'missing-journal-target')
        for verb in ('activate', 'rollback'):
            with self.assertRaisesRegex(Denied, '^cohort-journal-missing$'):
                getattr(self.fresh(), verb)(KEY)
            self.assertEqual(self.runtime.effects, [])
        self.assertTrue(path.is_symlink())

    def test_missing_journal_after_partial_drain_is_not_unstarted(self):
        self.engine.activate(KEY); self.drained()
        self.engine.path('transactions', KEY).unlink()
        before = list(self.runtime.effects)
        with self.assertRaisesRegex(Denied, '^cohort-journal-missing$'): self.fresh().rollback(KEY)
        self.assertEqual(self.runtime.effects, before)

    def test_same_id_restart_without_journal_or_receipt_is_not_unstarted(self):
        self.runtime.values[SERVICE]['State']['StartedAt'] = 'different-process'
        self.runtime.values[SERVICE]['RestartCount'] += 1
        with self.assertRaisesRegex(Denied, '^cohort-journal-missing$'): self.fresh().rollback(KEY)
        self.assertEqual(self.runtime.effects, [])

    def test_invalid_matching_process_pins_never_certify_unstarted(self):
        original = copy.deepcopy(self.runtime.values[SERVICE])
        for field, key, wrong in (
            ('Pid', 'pid', None), ('Pid', 'pid', 0), ('Pid', 'pid', True), ('Pid', 'pid', '101'),
            ('StartedAt', 'started_at', ''), ('StartedAt', 'started_at', None),
            ('StartedAt', 'started_at', '0001-01-01T00:00:00Z'),
            ('RestartCount', 'restarts', -1), ('RestartCount', 'restarts', False),
            ('RestartCount', 'restarts', '0'),
        ):
            value = self.runtime.values[SERVICE]; value.clear(); value.update(copy.deepcopy(original))
            if field == 'RestartCount': value[field] = wrong
            else: value['State'][field] = wrong
            admission = copy.deepcopy(self.admission)
            admission['previous_processes'][SERVICE][key] = wrong
            atomic(self.engine.path('admissions', KEY), admission)
            with self.subTest(field=field, wrong=wrong), self.assertRaisesRegex(Denied, '^cohort-journal-missing$'):
                self.fresh().rollback(KEY)
            self.assertEqual(self.runtime.effects, [])

    def test_only_unchanged_captured_preimage_is_certified_unstarted(self):
        with self.assertRaisesRegex(Denied, '^cohort-rollback-unstarted$'): self.fresh().rollback(KEY)
        self.assertEqual(self.runtime.effects, [])
        self.assertFalse(self.engine.path('transactions', KEY).exists())
        # A readiness-time restart must fail the final independent observation.
        original = self.runtime.frontend_probe
        def probe(binding):
            result = original(binding)
            self.runtime.values[SERVICE]['RestartCount'] += 1
            return result
        with patch.object(self.runtime, 'frontend_probe', side_effect=probe):
            with self.assertRaisesRegex(Denied, '^cohort-journal-missing$'): self.fresh().rollback(KEY)
        self.assertEqual(self.runtime.effects, [])

    def test_legacy_admission_without_process_pins_is_preserved_and_not_certified_unstarted(self):
        path = self.engine.path('admissions', KEY)
        legacy = copy.deepcopy(self.admission); legacy.pop('previous_processes')
        atomic(path, legacy); before = path.read_bytes()
        self.assertEqual(self.admit(), legacy)
        with self.assertRaisesRegex(Denied, '^cohort-journal-missing$'): self.fresh().rollback(KEY)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(self.runtime.effects, [])
        self.assertEqual(self.activate()['outcome'], 'activated')

    def test_worker_probe_bootstrap_refusal_waits_without_recreating_services(self):
        original = self.runtime.evidence
        remaining = [1]
        def bootstrap(verb, binding):
            if verb == 'cohort-worker-probe-v1' and remaining[0]:
                remaining[0] -= 1; raise Denied('host-command-failed')
            return original(verb, binding)
        self.runtime.evidence = bootstrap
        self.assertEqual(self.activate()['phase'], 'starting')
        self.assertFalse(self.engine.path('receipts', KEY).exists())
        effects = list(self.runtime.effects)
        self.assertEqual(self.fresh().activate(KEY)['outcome'], 'activated')
        self.assertEqual(self.runtime.effects, effects)

    def test_unready_existing_worker_cannot_be_admitted(self):
        original = self.runtime.evidence
        def unavailable(verb, binding):
            if verb == 'cohort-worker-probe-v1': raise Denied('host-command-failed')
            return original(verb, binding)
        self.runtime.evidence = unavailable
        with self.assertRaisesRegex(Denied, 'cohort-previous-unready'): self.admit()
        self.assertEqual(self.runtime.effects, [])

    def test_worker_probe_refusal_also_waits_during_rollback(self):
        self.activate()
        self.assertEqual(self.fresh().rollback(KEY)['phase'], 'draining')
        self.drained()
        original = self.runtime.evidence
        def bootstrap(verb, binding):
            if verb == 'cohort-worker-probe-v1': raise Denied('host-command-failed')
            return original(verb, binding)
        self.runtime.evidence = bootstrap
        self.assertEqual(self.fresh().rollback(KEY)['phase'], 'starting')
        self.assertFalse(self.engine.path('receipts', KEY + '-rollback').exists())
        effects = list(self.runtime.effects)
        for _ in range(3): self.assertEqual(self.fresh().rollback(KEY)['phase'], 'starting')
        self.assertEqual(self.runtime.effects, effects)
        self.runtime.evidence = original
        self.assertEqual(self.fresh().rollback(KEY)['outcome'], 'rolled-back')
        self.assertEqual(self.runtime.effects, effects)

    def test_frontend_failure_never_publishes_backend_only_success(self):
        self.runtime.front_ready = False
        self.assertEqual(self.activate()['phase'], 'starting')
        self.assertFalse(self.engine.path('receipts', KEY).exists())

    def test_absent_probe_refuses_before_drain(self):
        with self.assertRaisesRegex(Denied, 'cohort-frontend-probe-missing'): self.fresh(probe=False).activate(KEY)
        self.assertEqual(self.runtime.effects, [])

    def test_admission_requires_summary_pause_and_disabled_schedulers(self):
        valid = self.runtime.values[SERVICE]['Config']['Env']
        cases = [valid + ['INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=false']]
        for expected, wrong in (
            ('INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=true', 'INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=false'),
            ('INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER=disabled', 'INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER=enabled'),
            ('INTELLIGENCE_AUTO_SUMMARY_SCHEDULER=disabled', 'INTELLIGENCE_AUTO_SUMMARY_SCHEDULER=enabled'),
            ('READER_VALUE_MODE=jev_primary_v3', 'READER_VALUE_MODE=other'),
        ):
            cases.extend([[entry for entry in valid if entry != expected],
                          [wrong if entry == expected else entry for entry in valid]])
        for env in cases:
            self.runtime.values[SERVICE]['Config']['Env'] = env
            with self.assertRaisesRegex(Denied, 'cohort-worker-pause'):
                self.admit()
        self.assertEqual(self.runtime.effects, [])

    def test_cohort_policy_accepts_env_reordering_but_legacy_keeps_raw_order(self):
        value = copy.deepcopy(self.runtime.values[SERVICE])
        legacy = WorkerHost.policy(value)
        original = WorkerHost.cohort_policy_v1(value)
        value['Config']['Env'].reverse()
        self.assertEqual(WorkerHost.cohort_policy_v1(value), original)
        self.assertNotEqual(WorkerHost.policy(value), legacy)
        value['Config']['Env'].append('NEW_CONTROL=value')
        self.assertNotEqual(WorkerHost.cohort_policy_v1(value), original)
        value['Config']['Env'].pop()
        value['Config']['Env'][0] += '=changed'
        self.assertNotEqual(WorkerHost.cohort_policy_v1(value), original)
        value['Config']['Env'][0] = value['Config']['Env'][0][:-8]
        value['Config']['Env'].append(value['Config']['Env'][0])
        with self.assertRaisesRegex(Denied, 'worker-env-duplicate'):
            WorkerHost.cohort_policy_v1(value)
        value['Config']['Env'][-1] = value['Config']['Env'][0].split('=', 1)[0] + '=different'
        with self.assertRaisesRegex(Denied, 'worker-env-duplicate'):
            WorkerHost.cohort_policy_v1(value)
        value['Config']['Env'][-1] = 'malformed'
        with self.assertRaisesRegex(Denied, 'worker-env-invalid'):
            WorkerHost.cohort_policy_v1(value)

    def test_sha_run_attempt_provenance_and_verifier_mismatch_refused(self):
        for field, value in (('sha', 'e' * 40), ('ci_run_id', '124'), ('ci_run_attempt', '2')):
            proof = copy.deepcopy(self.proof); proof['authority'][field] = value
            proof['authority']['artifact_name'] = 'frontend-candidate-{sha}-{ci_run_id}-{ci_run_attempt}'.format(**proof['authority'])
            with self.subTest(field=field), self.assertRaises(Denied): self.admit(frontend_proof=proof)
        with self.assertRaisesRegex(Denied, 'cohort-verifier-proof'):
            self.admit(desired_verifier_sha256='sha256:' + '0' * 64)
        self.assertEqual(self.runtime.effects, [])

    def test_retagged_frontend_reference_refuses_before_effect(self):
        self.runtime.retagged = True
        with self.assertRaisesRegex(Denied, 'cohort-frontend-image-ref-drift'): self.engine.activate(KEY)
        self.assertEqual(self.runtime.effects, [])

    def test_non_target_and_worker_config_drift_refused(self):
        self.runtime.values[SERVICE]['Config']['Env'].append('JEV_OTHER=changed')
        with self.assertRaisesRegex(Denied, 'cohort-runtime-changed'): self.engine.activate(KEY)
        self.runtime.values[SERVICE]['Config']['Env'].pop()
        self.runtime.protected['postgres'] = 'changed'
        with self.assertRaisesRegex(Denied, 'cohort-non-target-changed'): self.engine.activate(KEY)

    def test_pending_startup_reuses_ci_proof_and_survives_fresh_engine(self):
        self.engine.activate(KEY); self.drained(); self.runtime.healthy = False
        calls = self.runtime.evidence_calls.count('cohort-backend-release-evidence')
        self.assertEqual(calls, 2)
        self.assertEqual(self.fresh().activate(KEY)['phase'], 'starting')
        self.assertEqual(self.fresh().activate(KEY)['phase'], 'starting')
        self.assertEqual(self.runtime.evidence_calls.count('cohort-backend-release-evidence'), calls)
        self.runtime.healthy = True
        self.assertEqual(self.fresh().activate(KEY)['outcome'], 'activated')

    def test_receipt_publication_crash_reconciles_original_without_database_requery(self):
        self.engine.activate(KEY); self.drained()
        def publish(path, value, immutable=False):
            atomic(path, value, immutable)
            if path.parent.name == 'receipts': raise RuntimeError('published')
        with patch('cohort_controller.atomic', side_effect=publish):
            with self.assertRaisesRegex(RuntimeError, 'published'): self.engine.activate(KEY)
        receipt = self.engine.receipt(KEY)
        calls = self.core.database_calls
        self.assertEqual(self.fresh().activate(KEY), receipt)
        self.assertEqual(self.core.database_calls, calls)

    def test_every_receipt_field_is_exactly_bound_on_activation_and_rollback_replay(self):
        receipt = self.activate()
        for rollback in (False, True):
            if rollback:
                self.engine.rollback(KEY); self.drained()
                receipt = self.fresh().rollback(KEY)
            path = self.engine.path('receipts', KEY + ('-rollback' if rollback else ''))
            replay = lambda: self.fresh().activate(KEY, rollback=rollback)
            mutations = {field: {**receipt, field: None} for field in receipt}
            mutations['extra-field'] = {**receipt, 'unbound': True}
            mutations['finish-time'] = {**receipt, 'timings': {**receipt['timings'],
                'finished_at_ns': receipt['timings']['finished_at_ns'] + 1}}
            mutations['nested-provenance'] = copy.deepcopy(receipt)
            mutations['nested-provenance']['frontend']['authority']['ci_run_attempt'] = '2'
            mutations['nested-database'] = {**receipt, 'database': {**receipt['database'], 'unbound': True}}
            mutations['json-type'] = {**receipt, 'backup': {**receipt['backup'], 'verified': 1}}
            for field, changed in mutations.items():
                with self.subTest(rollback=rollback, field=field):
                    atomic(path, changed)
                    with self.assertRaisesRegex(Denied, 'cohort-receipt-conflict'): replay()
            atomic(path, receipt)
            self.assertEqual(replay(), receipt)

    def test_finish_time_is_durable_before_receipt_and_preserved_after_crash(self):
        self.engine.activate(KEY); self.drained()
        def pin(path, value, immutable=False):
            atomic(path, value, immutable)
            if path.parent.name == 'transactions' and 'finished_at_ns' in value:
                raise RuntimeError('finish-pinned')
        with patch('cohort_controller.atomic', side_effect=pin), \
             self.assertRaisesRegex(RuntimeError, 'finish-pinned'): self.engine.activate(KEY)
        tx = read_json(self.engine.path('transactions', KEY))
        self.assertFalse(self.engine.path('receipts', KEY).exists())
        with patch('cohort_controller.time.time_ns', return_value=tx['finished_at_ns'] + 999):
            receipt = self.fresh().activate(KEY)
        self.assertEqual(receipt['timings']['finished_at_ns'], tx['finished_at_ns'])

    def test_receipt_cannot_supply_missing_durable_finish_time(self):
        self.activate()
        path = self.engine.path('transactions', KEY)
        tx = read_json(path); del tx['finished_at_ns']; atomic(path, tx)
        with self.assertRaisesRegex(Denied, 'cohort-receipt-conflict'): self.fresh().activate(KEY)

    def test_successful_rollback_restores_three_exact_sources_and_previous_verifier(self):
        receipt = self.activate()
        self.assertEqual(self.engine.rollback(KEY)['phase'], 'draining'); self.drained()
        rolled = self.fresh().rollback(KEY)
        self.assertEqual(rolled['outcome'], 'rolled-back')
        self.assertEqual(rolled['active_sources'], self.previous)
        self.assertEqual(rolled['verifier_sha256'], checksum(self.old / 'verify.sh'))
        self.assertEqual(self.engine.receipt(KEY), receipt)
        self.assertEqual(self.fresh().rollback(KEY), rolled)

    def test_crash_after_frontend_create_starts_same_id_on_replay(self):
        self.engine.activate(KEY); self.drained()
        self.runtime.fail_service, self.runtime.fail_when = 'frontend', 'created'
        with self.assertRaisesRegex(RuntimeError, 'after-up'): self.engine.activate(KEY)
        created = self.runtime.values['frontend']['Id']
        receipt = self.fresh().activate(KEY)
        self.assertEqual(receipt['target_container_ids']['frontend'], created)
        self.assertIn('start-frontend', self.runtime.effects)

    def test_rollback_after_partial_activation_preserves_activation_override(self):
        self.engine.activate(KEY); self.drained()
        self.runtime.fail_service, self.runtime.fail_when = 'frontend', 'after'
        with self.assertRaises(RuntimeError): self.engine.activate(KEY)
        forward = self.engine.path('overrides', KEY).read_bytes()
        self.assertEqual(self.engine.rollback(KEY)['phase'], 'draining'); self.drained()
        rolled = self.fresh().rollback(KEY)
        self.assertEqual(rolled['active_sources'], self.previous)
        self.assertEqual(self.engine.path('overrides', KEY).read_bytes(), forward)
        self.assertTrue(self.engine.path('overrides', KEY + '-rollback').exists())

    def test_rollback_after_created_worker_reuses_proven_old_drain(self):
        self.engine.activate(KEY); self.drained()
        self.runtime.fail_service, self.runtime.fail_when = SERVICE, 'created'
        with self.assertRaises(RuntimeError): self.engine.activate(KEY)
        rolled = self.fresh().rollback(KEY)
        self.assertEqual(rolled['outcome'], 'rolled-back')
        self.assertEqual(self.runtime.effects.count('term'), 1)

    def test_rollback_runtime_incompatible_candidate_and_old_created_crash(self):
        self.activate()
        self.runtime.values[SERVICE]['Config']['Env'].append('NODE_VERSION=other')
        self.engine.rollback(KEY); self.drained()
        self.runtime.fail_service, self.runtime.fail_when = 'api', 'created'
        with self.assertRaises(RuntimeError): self.engine.rollback(KEY)
        receipt = self.fresh().rollback(KEY)
        self.assertEqual(receipt['outcome'], 'rolled-back')
        self.engine.observe(self.admission, complete=True)

    def test_new_stale_candidate_refused_before_import_and_signal(self):
        self.runtime.stale_main = True
        with self.assertRaisesRegex(Denied, 'backend-ci'): self.engine.activate(KEY)
        self.assertEqual(self.runtime.effects, [])

    def test_signal_intent_crash_replays_only_after_capability(self):
        with patch.object(self.engine.host.worker, 'term', side_effect=RuntimeError('pre-signal')):
            with self.assertRaises(RuntimeError): self.engine.activate(KEY)
        self.assertEqual(self.fresh().activate(KEY)['phase'], 'draining')
        self.assertEqual(self.runtime.effects.count('term'), 1)

    def test_schema_drift_after_drain_refuses_all_target_effects(self):
        self.engine.activate(KEY); self.drained(); self.core.changed = True
        with self.assertRaisesRegex(Denied, 'migration-required'): self.engine.activate(KEY)
        self.assertFalse(any(effect.startswith('up-') for effect in self.runtime.effects))

    def test_false_frontend_proof_or_restart_never_publishes_receipt(self):
        self.engine.activate(KEY); self.drained()
        original = self.runtime.frontend_probe
        def restart(binding):
            result = original(binding)
            self.runtime.values['frontend']['RestartCount'] += 1
            return result
        self.engine.frontend_probe = restart
        with self.assertRaisesRegex(Denied, 'cohort-frontend-race'): self.engine.activate(KEY)
        self.assertFalse(self.engine.path('receipts', KEY).exists())

    def test_verifier_replacement_during_drain_refuses_before_target_recreation(self):
        self.engine.activate(KEY); self.drained()
        (self.new / 'verify.sh').write_bytes(b'unapproved replacement')
        with self.assertRaisesRegex(Denied, 'cohort-verifier-proof'): self.engine.activate(KEY)
        self.assertFalse(any(effect.startswith('up-') for effect in self.runtime.effects))
        self.assertEqual(self.engine.rollback(KEY)['outcome'], 'rolled-back')

    def test_previous_frontend_sources_are_rechecked_before_first_effect(self):
        self.runtime.mount(self.runtime.values['frontend'], self.desired)
        with self.assertRaisesRegex(Denied, 'cohort-previous-frontend-drift'): self.engine.activate(KEY)
        self.assertEqual(self.runtime.effects, [])

    def test_real_probe_policy_integrates_with_distinct_previous_lane_shas(self):
        from frontend_probe import make_frontend_probe
        def inspect(ident):
            return copy.deepcopy(next(v for v in self.runtime.values.values() if v['Id'] == ident))
        def sources():
            return {m['Destination']: m['Source'] for m in self.runtime.values['frontend']['Mounts']}
        def http(url, **options):
            if 'release-sha.txt?' in url:
                body = (Path(sources()['/usr/share/nginx/public']) / 'release-sha.txt').read_bytes()
                return {'status': 200, 'body': body}
            return {'status': 401 if 'admin.social-monitor.app' in url else 200, 'body': b''}
        def admin(ident, **options):
            return (Path(sources()['/usr/share/nginx/admin']) / 'release-sha.txt').read_bytes()
        for value in self.runtime.values.values():
            value['State'].update(Pid=123, Restarting=False)
        probe = make_frontend_probe(inspect, http, admin)
        self.engine.frontend_probe = probe
        self.engine.activate(KEY); self.drained()
        self.assertEqual(self.engine.activate(KEY)['outcome'], 'activated')
        self.engine.rollback(KEY); self.drained()
        rolled = self.engine.rollback(KEY)
        self.assertEqual(rolled['active_releases'], {'public': OLD_SHA, 'admin': 'e' * 40})

    def test_false_or_unknown_terminal_outcomes_in_any_lane_block_before_effect(self):
        for namespace in (self.root, self.root / 'backend', self.engine.root):
            directory = namespace / 'transactions'; directory.mkdir(parents=True, exist_ok=True)
            path = directory / ('c' * 40 + '-999.json')
            for outcome in (None, False, 'starting', {}):
                atomic(path, {'outcome': outcome})
                with self.subTest(namespace=str(namespace), outcome=outcome), self.assertRaises(Denied):
                    self.engine.activate(KEY)
                self.assertEqual(self.runtime.effects, [])
            path.unlink()

    def test_read_only_methods_reject_unbound_path_keys(self):
        for method in (self.engine.receipt, self.engine.verify):
            with self.assertRaisesRegex(Denied, 'cohort-key'): method('../outside')

    def test_unknown_own_journal_state_never_skips_drain(self):
        self.engine.activate(KEY)
        path = self.engine.path('transactions', KEY)
        original = read_json(path)
        for mutate in (lambda tx: tx.update(outcome=False), lambda tx: tx.update(phase='unknown'),
                       lambda tx: tx.update(phase='starting')):
            tx = copy.deepcopy(original); mutate(tx); atomic(path, tx)
            with self.assertRaises(Denied): self.fresh().activate(KEY)
        self.assertFalse(any(effect.startswith('up-') for effect in self.runtime.effects))

    def prepare_rollback_before_worker_recreation(self):
        self.engine.activate(KEY); self.drained()
        self.runtime.fail_service, self.runtime.fail_when = 'api', 'before'
        with self.assertRaises(RuntimeError): self.engine.activate(KEY)
        self.runtime.reuse_worker = True
        return self.runtime.values[SERVICE]['Id']

    def test_rollback_same_image_reused_worker_restores_policy_before_start(self):
        previous = self.prepare_rollback_before_worker_recreation()
        rolled = self.engine.rollback(KEY)
        self.assertEqual(rolled['outcome'], 'rolled-back')
        self.assertEqual(rolled['target_container_ids'][SERVICE], previous)
        self.assertEqual(self.runtime.values[SERVICE]['HostConfig']['RestartPolicy'], RESTART)

    def test_rollback_rejects_a_different_drained_process_before_effects(self):
        self.prepare_rollback_before_worker_recreation()
        worker = self.runtime.values[SERVICE]
        original = copy.deepcopy(worker)
        for mutate in (lambda v: v['State'].update(StartedAt='different'),
                       lambda v: v.update(RestartCount=1),
                       lambda v: v.update(Image=IMAGE)):
            worker.clear(); worker.update(copy.deepcopy(original)); mutate(worker)
            worker['HostConfig']['RestartPolicy'] = RESTART.copy()
            before = list(self.runtime.effects)
            with self.assertRaises(Denied): self.fresh().rollback(KEY)
            self.assertEqual(self.runtime.effects, before)

    def test_restore_policy_effect_crash_is_idempotent_on_replay(self):
        previous = self.prepare_rollback_before_worker_recreation()
        restart = self.engine.host.worker.restart
        def restored_then_crashed(ident, policy):
            restart(ident, policy)
            raise RuntimeError('after-policy-restore')
        with patch.object(self.engine.host.worker, 'restart', side_effect=restored_then_crashed):
            with self.assertRaisesRegex(RuntimeError, 'after-policy-restore'): self.engine.rollback(KEY)
        self.assertFalse(self.runtime.values[SERVICE]['State']['Running'])
        rolled = self.fresh().rollback(KEY)
        self.assertEqual(rolled['target_container_ids'][SERVICE], previous)
        self.assertEqual(self.runtime.values[SERVICE]['HostConfig']['RestartPolicy'], RESTART)

    def test_already_running_reused_worker_recovers_only_own_policy_change(self):
        previous = self.prepare_rollback_before_worker_recreation()
        # Emulate a controller built before this fix: same-ID up happened but policy
        # stayed no, and death prevented a successful receipt or created-ID journal.
        original = self.engine.restore_worker_policy
        with patch.object(self.engine, 'restore_worker_policy', side_effect=lambda tx, admission, target, value, image: value):
            self.assertEqual(self.engine.rollback(KEY)['phase'], 'starting')
        self.assertTrue(self.runtime.values[SERVICE]['State']['Running'])
        rolled = self.fresh().rollback(KEY)
        self.assertEqual(rolled['target_container_ids'][SERVICE], previous)
        self.assertEqual(self.runtime.values[SERVICE]['HostConfig']['RestartPolicy'], RESTART)
        self.engine.restore_worker_policy = original

    def test_unexpected_worker_policy_is_not_silently_repaired(self):
        self.prepare_rollback_before_worker_recreation()
        self.runtime.values[SERVICE]['HostConfig']['RestartPolicy'] = {'Name': 'always', 'MaximumRetryCount': 0}
        with self.assertRaisesRegex(Denied, 'cohort-restart-restore-proof'): self.engine.rollback(KEY)

    def test_tree_mutation_preserving_markers_and_origin_refuses_admission(self):
        path = self.new / 'bundle/public/main.dart.js'
        path.write_bytes(path.read_bytes() + b' altered payload')
        with self.assertRaisesRegex(Denied, 'cohort-frontend-tree-proof'): self.admit()
        self.assertEqual(self.runtime.effects, [])

    def test_mutated_candidate_before_effect_does_not_block_exact_rollback(self):
        self.engine.activate(KEY); self.drained()
        path = self.new / 'bundle/public/main.dart.js'
        path.write_bytes(path.read_bytes() + b' altered payload')
        with self.assertRaisesRegex(Denied, 'cohort-frontend-tree-changed'): self.engine.activate(KEY)
        self.assertFalse(any(effect.startswith('up-') for effect in self.runtime.effects))
        self.assertEqual(self.engine.rollback(KEY)['outcome'], 'rolled-back')

    def test_changed_previous_tree_blocks_rollback_before_signal(self):
        self.activate()
        path = self.old / 'bundle/admin/main.dart.js'
        path.write_bytes(path.read_bytes() + b' altered old payload')
        with self.assertRaisesRegex(Denied, 'cohort-frontend-tree-changed'): self.engine.rollback(KEY)
        self.assertEqual(self.runtime.effects.count('term'), 1)
        self.assertEqual(self.runtime.values[SERVICE]['HostConfig']['RestartPolicy'], RESTART)

    def test_tree_mutation_during_frontend_probe_never_publishes_receipt(self):
        self.engine.activate(KEY); self.drained()
        original = self.runtime.frontend_probe
        def mutated(binding):
            proof = original(binding)
            path = self.new / 'bundle/public/main.dart.js'
            path.write_bytes(path.read_bytes() + b' changed during probe')
            return proof
        self.engine.frontend_probe = mutated
        with self.assertRaisesRegex(Denied, 'cohort-frontend-tree-changed'): self.engine.activate(KEY)
        self.assertFalse(self.engine.path('receipts', KEY).exists())

    def test_idle_startup_poll_does_not_rehash_full_tree(self):
        self.runtime.front_ready = False
        self.assertEqual(self.activate()['phase'], 'starting')
        with patch('cohort_controller.tree_digest', wraps=tree_digest) as tree:
            self.assertEqual(self.fresh().activate(KEY)['phase'], 'starting')
            tree.assert_not_called()

    def test_missing_current_candidate_paths_do_not_prevent_healthy_rollback(self):
        def existence(path, directory=False):
            path = Path(path)
            require(not path.is_symlink() and (path.is_dir() if directory else path.is_file()),
                    'synthetic-real-custody')
            return path
        self.activate()
        (self.new / 'verify.sh').unlink()
        shutil.rmtree(self.new / 'bundle/public')
        handles = [patch(name + '.trusted', side_effect=existence)
                   for name in ('cohort_controller', 'cohort_host', 'cohort_compose')]
        try:
            for handle in handles: handle.start()
            self.assertEqual(self.engine.rollback(KEY)['phase'], 'draining')
            self.drained()
            receipt = self.fresh().rollback(KEY)
            self.assertEqual(receipt['outcome'], 'rolled-back')
            self.assertEqual(receipt['active_sources'], self.previous)
        finally:
            for handle in reversed(handles): handle.stop()

    def test_tree_rejects_links_before_bundle_reader(self):
        path = self.new / 'bundle/public/main.dart.js'
        path.unlink(); path.symlink_to(self.archive)
        with patch('cohort_controller._validate_bundle') as reader:
            with self.assertRaisesRegex(Denied, 'frontend-tree-member'): self.admit()
            reader.assert_not_called()

    def test_frontend_policy_masks_only_managed_sources(self):
        value = copy.deepcopy(self.runtime.values['frontend'])
        before = self.engine.policy(value, 'frontend')
        self.runtime.mount(value, self.desired)
        self.assertEqual(self.engine.policy(value, 'frontend'), before)
        value['HostConfig']['ReadonlyRootfs'] = False
        self.assertNotEqual(self.engine.policy(value, 'frontend'), before)
        value['HostConfig']['ReadonlyRootfs'] = True
        value['Mounts'][0]['RW'] = True
        self.assertNotEqual(self.engine.policy(value, 'frontend'), before)
