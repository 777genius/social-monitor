"""Opt-in 3-target Docker integration, never a production Nginx/HTTPS/app E2E.

Actual: Docker/Compose, private bind mounts + /proc inode checks, served static
bytes, marker probe, worker signal/exit, restart policies, fs journal and crashes.
Named fakes: CI qualification/archive, SQL/backup, Nest capability, API HTTP.
Fixed production HTTPS URLs are mapped only to the exact TEST frontend network
namespace. No public site, actual app, model, image pull or real user project.
"""
import copy
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
import uuid

from backend_docker_test import SyntheticHost, SyntheticCore, SHELL, BASE, SHA, OLD_SHA, RUN, KEY
from cohort_controller import CohortRelease
from cohort_host import TARGETS
from contract import MACHINE, Denied, atomic, private_file_digest, read_json, require, trusted
from frontend_bundle_test import files
from frontend_host import MOUNTS
from frontend_marker import read_admin_marker
from frontend_probe import make_frontend_probe
from frontend_tree import tree_digest
from operator_adapter import Runner
from operator_probe import worker_probe
from worker_host import SERVICE, WorkerHost


class DockerHost(SyntheticHost):
    crash_before = None

    def command(self, argv, data=None):
        if self.crash_before and 'up' in argv and argv[-1] == self.crash_before:
            os._exit(94)
        return super().command(argv, data)

    def evidence(self, verb, binding):
        if verb == 'worker-probe':
            class Config:
                core = self.c
                recheck = lambda config: None
            result = worker_probe(Config(), Runner(), binding)
        else:
            result = super().evidence(verb, binding)
        # Match operator_adapter.dispatch's actual envelope; worker_drain's inner
        # reader intentionally returns only the observation, without its binding.
        return {**result, **binding, 'version': 1, 'observed_at': int(time.time())}


@unittest.skipUnless(os.environ.get('SOCIAL_MONITOR_COHORT_DOCKER_TEST') == '1' and os.geteuid() == 0,
                     'explicit isolated Docker TEST opt-in and UID0 required')
class ThreeTargetDockerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_umask = os.umask(0o022)
        parent = Path('/srv/workers/TEST-sm-cohort-three-target')
        parent.mkdir(mode=0o700, exist_ok=True); trusted(parent, directory=True)
        cls.directory = tempfile.TemporaryDirectory(prefix='run-', dir=parent)
        cls.base = Path(cls.directory.name)
        cls.owner = 'test-sm-cohort3-' + uuid.uuid4().hex[:10]
        cls.images = {}
        subprocess.run(['/usr/bin/docker', 'image', 'inspect', BASE], check=True, stdout=subprocess.DEVNULL)
        (cls.base / 'worker.sh').write_text(SHELL)
        fixture = Path(__file__).with_name('cohort_frontend.fixture.cts')
        shutil.copyfile(fixture, cls.base / 'server.cts')
        for role, revision in (('old', OLD_SHA), ('new', SHA), ('frontend', OLD_SHA)):
            dockerfile = ('FROM ' + BASE + '\nCOPY worker.sh /fixture.sh\n'
                'ENTRYPOINT ["/bin/sh", "/fixture.sh"]\n')
            if role == 'frontend':
                dockerfile = ('FROM ' + BASE + '\nCOPY server.cts /fixture/server.cts\n'
                    'ENTRYPOINT ["/bin/sh", "-c", "/bin/sh /run/bootstrap/verify-static-release.sh && '
                    'exec node --experimental-strip-types /fixture/server.cts"]\n')
            (cls.base / 'Dockerfile').write_text(dockerfile)
            tag = cls.owner + ':' + role
            subprocess.run(['/usr/bin/docker', 'build', '--network', 'none', '--pull=false',
                '--label', 'social-monitor.synthetic-owner=' + cls.owner,
                '--label', 'org.opencontainers.image.revision=' + revision,
                '--label', 'social-monitor.ci-run-id=' + RUN, '--tag', tag, str(cls.base)],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            cls.images[role] = subprocess.check_output(['/usr/bin/docker', 'image', 'inspect',
                '--format', '{{.Id}}', tag]).decode().strip()

    @classmethod
    def tearDownClass(cls):
        for image in cls.images.values():
            subprocess.run(['/usr/bin/docker', 'image', 'rm', image], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.directory.cleanup()
        os.umask(cls.original_umask)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='case-', dir=self.base)
        self.root = Path(self.directory.name)
        self.project = self.owner + '-' + uuid.uuid4().hex[:5]
        self.previous = {'/usr/share/nginx/public': str(self.root / 'previous-public'),
                         '/usr/share/nginx/admin': str(self.root / 'separate-admin'),
                         '/run/bootstrap/verify-static-release.sh': str(self.root / 'old-verifier.sh')}
        self.bundle = self.root / 'candidate'
        self.desired = {'/usr/share/nginx/public': str(self.bundle / 'public'),
                        '/usr/share/nginx/admin': str(self.bundle / 'admin'),
                        '/run/bootstrap/verify-static-release.sh': str(self.root / 'new-verifier.sh')}
        for name, content in files().items():
            lane, leaf = name.split('/', 1)
            new = self.bundle / name; new.parent.mkdir(parents=True, exist_ok=True); new.write_bytes(content)
            old = Path(self.previous['/usr/share/nginx/' + lane]) / leaf
            old.parent.mkdir(parents=True, exist_ok=True)
            old.write_bytes(content.replace(SHA.encode(), (OLD_SHA if lane == 'public' else 'e' * 40).encode()))
        for sources, public, admin in ((self.previous, OLD_SHA, 'e' * 40), (self.desired, SHA, SHA)):
            Path(sources['/usr/share/nginx/public'], 'favicon.svg').write_bytes(b'<svg/>')
            Path(sources['/run/bootstrap/verify-static-release.sh']).write_text(
                '#!/bin/sh\nset -eu\n' +
                'test "$(cat /usr/share/nginx/public/release-sha.txt)" = "' + public + '"\n' +
                'test "$(cat /usr/share/nginx/admin/release-sha.txt)" = "' + admin + '"\n')
        services = {s: {'image': self.images['old'], 'container_name': self.project + '-' + s,
            'network_mode': 'none', 'read_only': True, 'cap_drop': ['ALL'], 'restart': 'unless-stopped'}
            for s in (*TARGETS, 'sentinel')}
        services['frontend']['image'] = self.images['frontend']
        services['frontend']['volumes'] = [{'type': 'bind', 'source': source, 'target': target,
            'read_only': True, 'bind': {'create_host_path': False}} for target, source in self.previous.items()]
        self.compose = self.root / 'compose.json'; self.compose.write_text(json.dumps({'services': services}))
        self.config = {'project': self.project, 'project_directory': str(self.root),
            'compose_files': [str(self.compose)], 'env_files': [], 'fenced_units': [],
            'required_non_targets': {SERVICE: self.project + '-' + SERVICE, 'sentinel': self.project + '-sentinel'},
            'state': str(self.root / 'state'), 'inbox': str(self.root / 'inbox'),
            'migration_root': '/app/prisma/migrations'}
        (self.root / 'state/transactions').mkdir(parents=True); (self.root / 'state/controller.lock').touch()
        self.raw = DockerHost(self.config)
        self.addCleanup(self.cleanup_case)
        self.raw.command(self.raw.compose() + ['up', '-d', '--no-build', '--pull', 'never'])
        self.core = SyntheticCore(self.config, self.raw)
        self.engine = self.fresh()
        self.archive = patch('cohort_controller.inspect_archive', return_value={})
        self.archive.start(); self.addCleanup(self.archive.stop)
        self.wait(lambda: WorkerHost(None).signal_ready(self.inspect_service(SERVICE)))
        self.wait(self.frontend_listening)
        backend = self.root / 'backend.tar'; backend.write_bytes(b'synthetic')
        item = {'sha': SHA, 'ci_run_id': RUN, 'image_id': self.images['new'], 'archive_bytes': 9,
                'archive_sha256': 'sha256:' + 'a' * 64}
        proof = {'root': str(self.bundle), 'authority': {'sha': SHA, 'ci_run_id': RUN, 'ci_run_attempt': '1',
            'artifact_id': '456', 'artifact_name': f'frontend-candidate-{SHA}-{RUN}-1',
            'artifact_sha256': 'sha256:' + 'b' * 64, 'artifact_bytes': 100}, 'manifest_sha256': 'sha256:' + 'c' * 64,
            'archive_sha256': 'sha256:' + 'd' * 64, 'archive_bytes': 99, 'tree_sha256': tree_digest(self.bundle)}
        self.admission = self.engine.admit(KEY, item, proof, self.desired, backend,
            private_file_digest(self.desired['/run/bootstrap/verify-static-release.sh']))
        self.before, self.targets, _ = self.engine.observe(complete=True)

    def cleanup_case(self):
        try:
            self.raw.command(self.raw.compose() + ['down', '--remove-orphans', '--timeout', '10'])
            require(not self.raw.docker('ps', '-aq', '--filter',
                'label=com.docker.compose.project=' + self.project).strip(), 'synthetic-container-leak')
        finally:
            self.directory.cleanup()

    def inspect_service(self, service):
        return json.loads(self.raw.docker('inspect', self.project + '-' + service))[0]

    def http(self, url, **options):
        # Real HTTP, exclusively inside this exact TEST frontend network namespace.
        parsed = urlsplit(url)
        require(parsed.netloc in ('social-monitor.app', 'admin.social-monitor.app'), 'synthetic-http-url')
        port = 8081 if parsed.netloc.startswith('admin.') else 8080
        path = parsed.path + (('?' + parsed.query) if parsed.query else '')
        value = self.inspect_service('frontend'); pid = value['State']['Pid']
        require(value['Config']['Labels']['com.docker.compose.project'] == self.project and pid > 0,
                'synthetic-http-target')
        program = ('import http.client,json,sys; c=http.client.HTTPConnection("127.0.0.1",int(sys.argv[1]),timeout=5);'
            'c.request("GET",sys.argv[2]); r=c.getresponse(); b=r.read(int(sys.argv[3])+1);'
            'print(json.dumps({"status":r.status,"body":b.hex()})); c.close()')
        result = subprocess.run(['/usr/bin/nsenter', '--target', str(pid), '--net', '/usr/bin/python3', '-c',
            program, str(port), path, str(options['max_bytes'])], check=True, capture_output=True, timeout=7,
            env={'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent', 'LC_ALL': 'C', 'PYTHONDONTWRITEBYTECODE': '1'})
        decoded = json.loads(result.stdout); body = bytes.fromhex(decoded['body'])
        require(len(body) <= options['max_bytes'], 'synthetic-http-size')
        return {'status': decoded['status'], 'body': body}

    def frontend_listening(self):
        try:
            return self.http('https://social-monitor.app/', max_bytes=262144)['status'] == 200
        except (OSError, ValueError, subprocess.SubprocessError):
            return False

    def fresh(self):
        def inspect(ident): return json.loads(self.raw.docker('inspect', ident))[0]
        probe = make_frontend_probe(inspect, self.http, read_admin_marker)
        return CohortRelease(self.core, probe)

    def wait(self, condition):
        end = time.monotonic() + 40
        while not condition():
            self.assertLess(time.monotonic(), end, 'synthetic condition timeout')
            time.sleep(.1)

    def drain(self, rollback=False):
        self.assertEqual(self.engine.activate(KEY, rollback=rollback)['phase'], 'draining')
        self.wait(lambda: not self.inspect_service(SERVICE)['State']['Running'])

    def finish(self, rollback=False):
        receipt = {}
        def complete():
            nonlocal receipt
            receipt = self.fresh().activate(KEY, rollback=rollback)
            return 'outcome' in receipt
        self.wait(complete)
        snapshot, targets, values = self.engine.observe(complete=True)
        self.assertEqual(snapshot, self.before)
        self.assertEqual(values[SERVICE]['HostConfig']['RestartPolicy'], self.admission['restart_policy'])
        return receipt

    def crash(self, *, after_create=None, before_up=None, after_receipt=False, rollback=False):
        def child():
            self.raw.crash_service, self.raw.crash_before = after_create, before_up
            if after_receipt:
                def publication(path, value, immutable=False):
                    atomic(path, value, immutable)
                    if path.parent.name == 'receipts': os._exit(95)
                with patch('cohort_controller.atomic', side_effect=publication):
                    self.fresh().activate(KEY, rollback=rollback)
            else:
                self.fresh().activate(KEY, rollback=rollback)
        process = multiprocessing.get_context('fork').Process(target=child)
        process.start(); process.join(40)
        self.assertFalse(process.is_alive(), 'synthetic crash child timed out')
        self.assertEqual(process.exitcode, 95 if after_receipt else 94 if before_up else 93)

    def test_crash_after_frontend_create_replays_exact_three_target_activation(self):
        self.drain(); self.crash(after_create='frontend')
        frontend = self.inspect_service('frontend')
        self.assertEqual(frontend['State']['Status'], 'created')
        result = self.finish()
        self.assertEqual(result['outcome'], 'activated')
        self.assertEqual(result['target_container_ids']['frontend'], frontend['Id'])

    def test_missing_candidate_paths_roll_back_healthy_independent_previous_sources(self):
        self.drain(); activated = self.finish()
        Path(self.desired['/run/bootstrap/verify-static-release.sh']).unlink()
        shutil.rmtree(self.bundle / 'public')
        self.drain(rollback=True); rolled = self.finish(rollback=True)
        self.assertEqual(rolled['active_sources'], self.previous)
        self.assertEqual(rolled['active_releases'], {'public': OLD_SHA, 'admin': 'e' * 40})
        self.assertEqual(self.engine.receipt(KEY), activated)

    def test_same_id_old_worker_rollback_restores_captured_restart_policy(self):
        previous = self.targets[SERVICE]['id']
        self.drain(); self.crash(before_up='api')
        rolled = self.finish(rollback=True)
        self.assertEqual(rolled['outcome'], 'rolled-back')
        self.assertEqual(rolled['target_container_ids'][SERVICE], previous)

    def test_crash_after_common_receipt_reconciles_immutable_publication(self):
        self.drain(); self.crash(after_receipt=True)
        before = self.engine.receipt(KEY)
        self.assertIsNone(read_json(self.engine.path('transactions', KEY))['outcome'])
        self.assertEqual(self.finish(), before)

    def test_controller_wire_generated_verifier_crash_replay_and_rollback(self):
        # Real Controller grammar/lock, wire, verifier and engine. The fixed C
        # launcher/installed config are separately tested, not executed here.
        staged = self.core.state / 'cohort/frontend/candidates' / KEY
        staged.mkdir(parents=True)
        shutil.move(str(self.bundle), staged / 'bundle'); self.bundle = staged / 'bundle'
        proof = {**self.admission['frontend'], 'root': str(self.bundle)}
        atomic(staged / 'proof.json', proof)
        backend = self.core.state / 'cohort/backend'
        for family in ('imports', 'inbox'): (backend / family).mkdir(parents=True)
        item = {k: self.admission[k] for k in ('sha', 'ci_run_id', 'image_id', 'archive_bytes', 'archive_sha256')}
        atomic(backend / 'imports' / (KEY + '.json'), item)
        shutil.copyfile(self.root / 'backend.tar', backend / 'inbox' / (KEY + '.tar'))
        self.engine.path('admissions', KEY).unlink()  # Replace only this fixture's initial admission.
        self.core.identity = lambda: MACHINE  # Explicit TEST identity; no production config read.
        def cli(verb): return self.core.dispatch('cohort-' + verb + ' ' + SHA + ' ' + RUN)
        def terminal(verb):
            result = {}
            def ready():
                nonlocal result
                result = cli(verb)
                return 'outcome' in result
            self.wait(ready)
            return result
        with patch('cohort_wire.make_runtime_frontend_probe', side_effect=lambda: self.fresh().frontend_probe):
            with self.assertRaises(Denied): self.core.dispatch('cohort-activate ' + SHA + ' ' + RUN + ' extra')
            self.admission = cli('admit'); self.desired = self.admission['desired_sources']
            self.assertEqual(private_file_digest(self.desired['/run/bootstrap/verify-static-release.sh']),
                             self.admission['desired_verifier_sha256'])
            self.assertEqual(cli('activate')['phase'], 'draining')
            self.wait(lambda: not self.inspect_service(SERVICE)['State']['Running'])
            def crash():
                self.raw.crash_service = 'frontend'; cli('activate')
            process = multiprocessing.get_context('fork').Process(target=crash)
            process.start(); process.join(40)
            self.assertFalse(process.is_alive()); self.assertEqual(process.exitcode, 93)
            created = self.inspect_service('frontend')['Id']
            activated = terminal('activate')
            self.assertEqual(activated['target_container_ids']['frontend'], created)
            self.assertEqual(cli('activate'), activated)
            self.assertTrue(cli('verify')['verified'])
            self.assertEqual(cli('rollback')['phase'], 'draining')
            self.wait(lambda: not self.inspect_service(SERVICE)['State']['Running'])
            rolled = terminal('rollback')
            self.assertEqual(rolled['active_sources'], self.previous)
            self.assertEqual(cli('rollback'), rolled)
            self.assertEqual(self.core.dispatch('cohort-receipt ' + KEY), activated)
            self.assertEqual(self.core.dispatch('cohort-receipt ' + KEY + '-rollback'), rolled)
            snapshot, _, values = self.engine.observe(complete=True)
            self.assertEqual(snapshot, self.before)
            self.assertEqual(values[SERVICE]['HostConfig']['RestartPolicy'], self.admission['restart_policy'])
