"""Opt-in real Docker journal recovery. Synthetic shells only; no application/LLM.

Run as UID0 on an isolated TEST host with the base image already cached:
SOCIAL_MONITOR_BACKEND_DOCKER_TEST=1 python3 -m unittest discover \
    -s ops/release/hetzner -p backend_docker_test.py -v
CI/source/SQL evidence are explicit fakes. Docker, Compose, IDs, signals, logs,
restart policy, filesystem journal and crash/replay use their real implementations.
"""
import json
import multiprocessing
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
import uuid

from backend_controller import BackendRelease
from backend_host import TARGETS
from contract import atomic, digest, read_json, require, trusted
from controller import Controller
from host import Host
from operator_adapter import Runner
from operator_probe import worker_drain
from worker_host import SERVICE, WorkerHost

BASE = 'node:22.23.4-alpine'
SHA, OLD_SHA, RUN = 'a' * 40, 'b' * 40, '123'
KEY = SHA + '-' + RUN
SHELL = r'''#!/bin/sh
stopping=0
trap 'if [ "$stopping" -eq 0 ]; then
  stopping=1
  sleep 2
  milliseconds=$(($(date +%s) * 1000))
  printf "{\"marker\":\"social-monitor-worker-modules-drained-v1\",\"signal\":\"SIGTERM\",\"pid\":1,\"completed_at_ms\":%s}\n" "$milliseconds"
  exit 0
fi' TERM
while :; do sleep 1; done
'''


class SyntheticHost(Host):
    crash_service = None

    def command(self, argv, data=None):
        if self.crash_service and 'up' in argv and argv[-1] == self.crash_service:
            position = argv.index('up') + 1
            super().command([*argv[:position], '--no-start', *argv[position:]], data)
            os._exit(93)  # Abrupt controller death after Docker create, before journal.
        return super().command(argv, data)

    def model(self, override=None):
        # TEST root substitutes only the production path allowlist, not Compose.
        return json.loads(self.command(self.compose(override) + [
            '--profile', '*', 'config', '--no-interpolate', '--no-env-resolution', '--format', 'json']))

    def probe(self, image, sha):
        _, target = self.snapshot()
        return target['running'] and target['image'] == image

    def evidence(self, verb, binding):
        if verb in ('backend-release-evidence', 'cohort-backend-release-evidence'):
            return {**binding, 'policy': 'backend-cohort-ci-v1', 'main_sha': SHA, 'head_sha': SHA,
                'event': 'push', 'branch': 'main', 'legacy_workflow': 'disabled_manually',
                'jobs': ['success'], 'job_observations': ['synthetic-not-github'], 'run_attempt': 1,
                'deltas': {s: {'base': OLD_SHA, 'head': SHA, 'complete_delta': True,
                    'changed_paths': ['apps/api-gateway/src/synthetic.ts'],
                    'delta_sha256': 'sha256:' + 'c' * 64} for s in TARGETS}}
        if verb == 'worker-capability':
            # This shell is not Nest. Its one-shot trap is only a Docker lifecycle fixture.
            return {'supported': True, 'service': SERVICE, 'signal_replay': 'nest-guarded-v1'}
        if verb == 'worker-probe':
            value = json.loads(self.docker('inspect', binding['container_id']))[0]
            ready = value['State']['Running'] and WorkerHost(None).signal_ready(value)
            return {'ready': ready, 'service': SERVICE}
        if verb == 'worker-drain':
            class Config:
                core = self.c
                recheck = lambda config: None
            return worker_drain(Config(), Runner(), binding)
        raise AssertionError(verb)

    def import_image(self, archive, item):
        require(self.image(item['image_id'])['id'] == item['image_id'], 'synthetic-image')

    def retain(self, images):
        pass  # Own fixture images are retained until class teardown, no production tags.


class SyntheticCore(Controller):
    database = lambda self, item: {'synthetic_schema': 'unchanged'}
    backup = lambda self, item: {'synthetic_backup': True}
    retained_database = lambda self, admission, value: require(value == admission['database'], 'synthetic-schema')


@unittest.skipUnless(os.environ.get('SOCIAL_MONITOR_BACKEND_DOCKER_TEST') == '1'
                     and os.geteuid() == 0, 'explicit isolated Docker TEST opt-in and UID0 required')
class DockerRecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path('/srv/workers/TEST-sm-backend-docker-20261110')
        root.mkdir(mode=0o700, exist_ok=True)
        trusted(root, directory=True)
        cls.directory = tempfile.TemporaryDirectory(prefix='cohort-', dir=root)
        cls.base = Path(cls.directory.name)
        cls.owner = 'test-sm-cohort-' + uuid.uuid4().hex[:10]
        cls.images = {}
        subprocess.run(['/usr/bin/docker', 'image', 'inspect', BASE], check=True, stdout=subprocess.DEVNULL)
        (cls.base / 'worker.sh').write_text(SHELL)
        (cls.base / 'Dockerfile').write_text('FROM ' + BASE + '\nCOPY worker.sh /fixture.sh\n'
            'ENTRYPOINT ["/bin/sh", "/fixture.sh"]\n')
        for name, revision in (('old', OLD_SHA), ('new', SHA)):
            tag = cls.owner + ':' + name
            subprocess.run(['/usr/bin/docker', 'build', '--network', 'none', '--pull=false',
                '--label', 'social-monitor.synthetic-owner=' + cls.owner,
                '--label', 'org.opencontainers.image.revision=' + revision,
                '--label', 'social-monitor.ci-run-id=' + RUN, '--tag', tag, str(cls.base)],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            cls.images[name] = subprocess.check_output(['/usr/bin/docker', 'image', 'inspect',
                '--format', '{{.Id}}', tag]).decode().strip()

    @classmethod
    def tearDownClass(cls):
        for image in cls.images.values():
            subprocess.run(['/usr/bin/docker', 'image', 'rm', image], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.directory.cleanup()

    def setUp(self):
        self.project = self.owner + '-' + uuid.uuid4().hex[:5]
        self.directory = tempfile.TemporaryDirectory(prefix='case-', dir=self.base)
        self.root = Path(self.directory.name)
        self.compose = self.root / 'compose.json'
        services = {s: {'image': self.images['old'], 'container_name': self.project + '-' + s,
            'network_mode': 'none', 'read_only': True, 'cap_drop': ['ALL'],
            'restart': 'unless-stopped'} for s in (*TARGETS, 'sentinel')}
        self.compose.write_text(json.dumps({'services': services}))
        self.config = {'project': self.project, 'project_directory': str(self.root),
            'compose_files': [str(self.compose)], 'env_files': [], 'fenced_units': [],
            'required_non_targets': {SERVICE: self.project + '-' + SERVICE,
                                     'sentinel': self.project + '-sentinel'},
            'state': str(self.root / 'state'), 'inbox': str(self.root / 'inbox'),
            'migration_root': '/app/prisma/migrations'}
        (self.root / 'state' / 'transactions').mkdir(parents=True)
        (self.root / 'state' / 'controller.lock').touch()
        self.host = SyntheticHost(self.config)
        self.addCleanup(self.cleanup_case)
        self.host.command(self.host.compose() + ['up', '-d', '--no-build', '--pull', 'never'])
        self.release = self.new_release()
        self.release.initialize()
        self.wait(lambda: self.worker()['State']['Running'] and WorkerHost(None).signal_ready(self.worker()))
        snapshot, targets, values = self.release.observe()
        self.sentinel, self.initial_values = snapshot, values
        admission = {'sha': SHA, 'ci_run_id': RUN, 'image_id': self.images['new'],
            'archive_sha256': 'sha256:' + 'd' * 64,
            'previous_image_ids': {s: self.images['old'] for s in TARGETS},
            'previous_revisions': {s: OLD_SHA for s in TARGETS},
            'snapshot_sha256': digest(snapshot), 'compose_hash': self.host.compose_fingerprint(),
            'runtime_sha256': {s: self.release.host.policy(v, s) for s, v in values.items()},
            'restart_policy': values[SERVICE]['HostConfig']['RestartPolicy'],
            'database': {'synthetic_schema': 'unchanged'}}
        admission['compatibility'] = self.release.evidence(admission,
            admission['previous_revisions'], admission['snapshot_sha256'])
        atomic(self.release.path('admissions', KEY), admission)
        self.archive = patch('backend_controller.inspect_archive', return_value={})
        self.archive.start()
        self.addCleanup(self.archive.stop)

    def cleanup_case(self):
        try:
            self.host.command(self.host.compose() + ['down', '--remove-orphans', '--timeout', '10'])
        finally:
            self.directory.cleanup()

    def new_release(self):
        return BackendRelease(SyntheticCore(self.config, self.host))

    def worker(self):
        return json.loads(self.host.docker('inspect', self.project + '-' + SERVICE))[0]

    def wait(self, predicate):
        end = time.monotonic() + 30
        while not predicate():
            self.assertLess(time.monotonic(), end, 'synthetic Docker condition timed out')
            time.sleep(0.1)

    def drain(self, rollback=False):
        self.assertEqual(self.release.activate(KEY, rollback=rollback)['phase'], 'draining')
        self.wait(lambda: not self.worker()['State']['Running'])

    def finish(self, rollback=False):
        result = {}
        def complete():
            nonlocal result
            try:
                result = self.new_release().activate(KEY, rollback=rollback)
            except Exception as error:
                _, targets = self.release.host.snapshot(complete=False)
                differences = {}
                for service, target in targets.items():
                    value, old = self.release.host.inspect(target), self.initial_values[service]
                    for section in ('Config', 'HostConfig'):
                        excluded = {'Image', 'Labels', 'Hostname'} if section == 'Config' else {'RestartPolicy'}
                        for field in set(value[section]) | set(old[section]):
                            if field not in excluded and value[section].get(field) != old[section].get(field):
                                differences[service + '.' + section + '.' + field] = (old[section].get(field), value[section].get(field))
                self.fail(str(error) + ' synthetic policy diff=' + json.dumps(differences, sort_keys=True))
            return 'outcome' in result
        self.wait(complete)
        snapshot, targets, values = self.release.observe()
        self.assertEqual(snapshot, self.sentinel)
        self.assertEqual(values[SERVICE]['HostConfig']['RestartPolicy'],
                         {'Name': 'unless-stopped', 'MaximumRetryCount': 0})
        return result

    def crash_after_create(self, service, rollback=False):
        def crash():
            self.host.crash_service = service
            self.new_release().activate(KEY, rollback=rollback)
        child = multiprocessing.get_context('fork').Process(target=crash)
        child.start(); child.join(30)
        self.assertFalse(child.is_alive(), 'synthetic crash child did not terminate')
        self.assertEqual(child.exitcode, 93)
        target = json.loads(self.host.docker('inspect', self.project + '-' + service))[0]
        self.assertEqual(target['State']['Status'], 'created')
        self.assertEqual(target['RestartCount'], 0)
        return target['Id']

    def test_activation_resumes_exact_created_api_after_process_crash(self):
        self.drain()
        created = self.crash_after_create('api')
        result = self.finish()
        self.assertEqual(result['outcome'], 'activated')
        self.assertEqual(result['target_container_ids']['api'], created)
        self.assertEqual(set(result['active_image_ids'].values()), {self.images['new']})

    def test_rollback_resumes_exact_created_old_api_after_process_crash(self):
        self.drain(); activated = self.finish()
        self.drain(rollback=True)
        created = self.crash_after_create('api', rollback=True)
        result = self.finish(rollback=True)
        self.assertEqual(result['outcome'], 'rolled-back')
        self.assertEqual(result['target_container_ids']['api'], created)
        self.assertEqual(set(result['active_image_ids'].values()), {self.images['old']})
        self.assertEqual(read_json(self.release.path('receipts', KEY)), activated)

    def test_never_started_candidate_worker_is_rolled_back_without_starting_it(self):
        self.drain()
        created = self.crash_after_create(SERVICE)
        result = self.finish(rollback=True)
        self.assertEqual(result['outcome'], 'rolled-back')
        self.assertNotEqual(result['target_container_ids'][SERVICE], created)
        self.assertEqual(set(result['active_image_ids'].values()), {self.images['old']})
