"""Synthetic host observations and Compose models; no Docker or model calls."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from contract import Denied
from cohort_host import CohortHost, TARGETS
from cohort_compose import override
from frontend_host import MOUNTS
from frontend_host_test import model
from worker_host import SERVICE

IMAGES = {'api': 'sha256:' + 'a' * 64, SERVICE: 'sha256:' + 'b' * 64}


class FakeHost:
    def __init__(self):
        self.c = {'project': 'TEST-cohort', 'compose_files': ['/trusted/compose.yml']}
        self.base = model()
        self.base['services'][SERVICE] = self.base['services'].pop('worker')
        self.base['services']['frontend']['volumes'][0]['bind'] = {'create_host_path': False}
        self.base['services']['sentinel'] = {'image': 'untouched'}
        self.rows = [{'service': service, 'project': self.c['project'], 'id': str(index) * 64,
                      'image': 'sha256:' + 'd' * 64} for index, service in enumerate(TARGETS, 1)]
        self.protected = {'containers': {'sentinel': {'image': 'untouched'}}, 'units': {}}
        self.calls, self.inspect_calls = [], []
        self.fingerprint, self.fault = 'trusted-fingerprint', None
        self.values = {row['id']: {'Id': row['id'], 'Image': row['image'], 'Config': {'Labels': {
            'com.docker.compose.project': self.c['project'], 'com.docker.compose.service': row['service'],
            'com.docker.compose.project.config_files': '/trusted/compose.yml'}},
            'State': {'Running': True, 'Pid': 4242, 'StartedAt': '2026-11-10T00:00:00Z'}, 'RestartCount': 0,
            'Mounts': [{'Type': 'bind', 'Source': '/trusted/old/' + name, 'Destination': target, 'RW': False}
                       for target, (name, _) in MOUNTS.items()]} for row in self.rows}

    def snapshot(self, **kwargs):
        self.snapshot_options = kwargs
        return copy.deepcopy(self.protected), copy.deepcopy(self.rows)

    def docker(self, verb, ident):
        assert verb == 'inspect'
        self.inspect_calls.append(ident)
        return json.dumps([self.values[ident]]).encode()

    def model(self, path=None):
        result = copy.deepcopy(self.base)
        if path is not None:
            document = json.loads(Path(path).read_text())
            for service, fields in document['services'].items():
                if 'volumes' in fields:
                    replacements = {item['target']: copy.deepcopy(item) for item in fields['volumes']}
                    result['services'][service]['volumes'] = [replacements.pop(item['target'], item)
                        for item in result['services'][service]['volumes']] + list(replacements.values())
                for key, value in fields.items():
                    if key != 'volumes': result['services'][service][key] = copy.deepcopy(value)
            if self.fault == 'non-target': result['services']['sentinel']['image'] = 'changed'
            if self.fault == 'options':
                next(item for item in result['services']['frontend']['volumes'] if item['target'] in MOUNTS)[
                    'bind'] = {'create_host_path': True}
        return result

    def compose(self, path):
        return ['docker', 'compose', '-f', str(path)]

    def compose_fingerprint(self):
        return self.fingerprint

    def command(self, argv):
        self.calls.append(argv)


class CohortHostTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='TEST-cohort-host-')
        self.root = Path(self.temporary.name)
        (self.root / 'overrides').mkdir()
        self.path = self.root / 'overrides' / 'release.json'
        self.raw = FakeHost()
        self.host = CohortHost(self.raw, self.root)
        self.frontend = self.raw.rows[2]
        self.sources = dict(zip(MOUNTS, ['/trusted/separate-public', '/trusted/other-admin', '/trusted/verifier.sh']))
        self.trust = patch('cohort_host.trusted', side_effect=lambda path, directory=False: Path(path))
        self.compose_trust = patch('cohort_compose.trusted', side_effect=lambda path, directory=False: Path(path))
        self.frontend_trust = patch('frontend_host.trusted', side_effect=lambda path, directory=False: Path(path))
        self.verifier = patch('frontend_host.private_file_digest', return_value='sha256:verifier')
        native_stat = os.stat
        mounted_paths = ({'/trusted/old/' + name for name, _ in MOUNTS.values()} |
                         set(self.sources.values()) | {'/proc/4242/root' + target for target in MOUNTS})
        def mounted_stat(path, *args, **kwargs):
            if str(path) in mounted_paths:
                return SimpleNamespace(st_dev=1, st_ino=2)
            return native_stat(path, *args, **kwargs)
        self.mount_stat = patch('frontend_host.os.stat', side_effect=mounted_stat)
        for handle in (self.trust, self.compose_trust, self.frontend_trust, self.verifier, self.mount_stat):
            handle.start(); self.addCleanup(handle.stop)
        self.addCleanup(self.temporary.cleanup)

    def test_one_snapshot_fixes_exact_three_targets_and_preserves_every_non_target(self):
        snapshot, targets = self.host.snapshot()
        self.assertEqual(self.raw.snapshot_options, {'target_services': TARGETS, 'allow_missing_targets': False})
        self.assertEqual(snapshot, self.raw.protected)
        self.assertEqual(set(targets), {'api', SERVICE, 'frontend'})
        self.raw.rows.pop()
        with self.assertRaisesRegex(Denied, 'cohort-target-count'): self.host.snapshot()
        _, remaining = self.host.snapshot(complete=False)
        self.assertEqual(set(remaining), {'api', SERVICE})
        self.assertTrue(self.raw.snapshot_options['allow_missing_targets'])
        self.raw.rows.append(copy.deepcopy(self.raw.rows[0]))
        with self.assertRaisesRegex(Denied, 'cohort-target-count'): self.host.snapshot(complete=False)

    def test_frontend_capture_requires_exact_inspect_and_matching_effective_roots(self):
        captured = self.host.current_sources(self.frontend)
        self.assertEqual(captured['sources']['/usr/share/nginx/public'], '/trusted/old/public')
        self.assertEqual(captured['verifier_sha256'], 'sha256:verifier')
        self.assertEqual(self.raw.inspect_calls, [self.frontend['id']] * 3)
        for field, value in [('Id', 'f' * 64), ('Image', 'sha256:' + 'f' * 64)]:
            original = self.raw.values[self.frontend['id']][field]
            self.raw.values[self.frontend['id']][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(Denied, 'cohort-inspect-binding'):
                self.host.current_sources(self.frontend)
            self.raw.values[self.frontend['id']][field] = original
        self.raw.values[self.frontend['id']]['Config']['Labels']['com.docker.compose.project.config_files'] += ',/foreign.yml'
        with self.assertRaisesRegex(Denied, 'cohort-runtime-roots-drift'): self.host.current_sources(self.frontend)

    def test_source_capture_refuses_restart_after_the_mounted_inode_check(self):
        inspect = self.raw.docker
        def restarted(verb, ident):
            result = json.loads(inspect(verb, ident))
            if len(self.raw.inspect_calls) == 3:
                result[0]['RestartCount'] += 1
            return json.dumps(result).encode()
        self.raw.docker = restarted
        with self.assertRaisesRegex(Denied, 'cohort-frontend-race'): self.host.current_sources(self.frontend)

    def activate_sources(self):
        self.path.write_text(json.dumps(override(self.raw.base, IMAGES, self.sources)))
        value = self.raw.values[self.frontend['id']]
        value['Config']['Labels']['com.docker.compose.project.config_files'] += ',' + str(self.path)
        for item in value['Mounts']: item['Source'] = self.sources[item['Destination']]

    def test_previous_independent_paths_are_captured_from_the_exact_live_override(self):
        self.activate_sources()
        result = self.host.current_sources(self.frontend, self.path)
        self.assertEqual(result['sources'], self.sources)
        with self.assertRaisesRegex(Denied, 'cohort-runtime-roots-drift'): self.host.current_sources(self.frontend)
        document = json.loads(self.path.read_text())
        document['services']['frontend']['environment'] = {'MODE': 'same'}
        self.path.write_text(json.dumps(document))
        with self.assertRaisesRegex(Denied, 'cohort-runtime-override-drift'):
            self.host.current_sources(self.frontend, self.path)

    def test_saved_bind_options_and_shadow_mounts_are_not_silently_accepted(self):
        self.activate_sources()
        document = json.loads(self.path.read_text())
        document['services']['frontend']['volumes'][0]['bind']['create_host_path'] = True
        self.path.write_text(json.dumps(document))
        with self.assertRaises(Denied): self.host.current_sources(self.frontend, self.path)
        self.path.write_text(json.dumps(override(self.raw.base, IMAGES, self.sources)))
        self.raw.values[self.frontend['id']]['Mounts'].append(
            {'Type': 'bind', 'Source': '/shadow', 'Destination': '/usr/share/nginx/public/assets', 'RW': False})
        with self.assertRaisesRegex(Denied, 'frontend-shadow-mount'):
            self.host.current_sources(self.frontend, self.path)

    def test_exact_forward_and_previous_values_apply_only_one_service_without_dependencies(self):
        for service in TARGETS:
            self.host.up(IMAGES, self.sources, self.path, self.raw.fingerprint, service)
            command = self.raw.calls[-1]
            self.assertEqual(command[-7:], ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', service])
            saved = json.loads(self.path.read_text())
            volumes = saved['services']['frontend']['volumes']
            self.assertEqual({item['target']: item['source'] for item in volumes}, self.sources)
            self.assertEqual(volumes[0]['bind'], {'create_host_path': False})
        previous = {target: '/trusted/old/' + name for target, (name, _) in MOUNTS.items()}
        previous_images = {name: 'sha256:' + 'e' * 64 for name in IMAGES}
        self.host.up(previous_images, previous, self.path, self.raw.fingerprint, 'frontend')
        restored = json.loads(self.path.read_text())['services']
        self.assertEqual({item['target']: item['source'] for item in restored['frontend']['volumes']}, previous)
        self.assertEqual({name: restored[name]['image'] for name in IMAGES}, previous_images)

    def test_scope_fingerprint_and_foreign_override_refuse_before_compose_effect(self):
        for fault in ('non-target', 'options'):
            self.raw.fault = fault
            with self.subTest(fault=fault), self.assertRaises(Denied):
                self.host.up(IMAGES, self.sources, self.path, self.raw.fingerprint, 'frontend')
        self.raw.fault = None
        for service in ('postgres', '--remove-orphans'):
            with self.assertRaisesRegex(Denied, 'cohort-compose-service'):
                self.host.up(IMAGES, self.sources, self.path, self.raw.fingerprint, service)
        with self.assertRaisesRegex(Denied, 'trusted-compose-changed'):
            self.host.up(IMAGES, self.sources, self.path, 'stale', 'api')
        with self.assertRaisesRegex(Denied, 'cohort-override-path'):
            self.host.up(IMAGES, self.sources, self.root / 'foreign.json', self.raw.fingerprint, 'api')
        self.assertEqual(self.raw.calls, [])

    @unittest.skipUnless(shutil.which('docker'), 'Docker Compose CLI is unavailable')
    def test_real_compose_config_keeps_three_independent_paths_and_saved_options(self):
        specification = self.root / 'compose.json'
        specification.write_text(json.dumps(self.raw.base))
        def compose(path=None):
            args = ['docker', 'compose', '--project-name', 'test-cohort-host', '-f', str(specification)]
            return args + (['-f', str(path)] if path is not None else [])
        def model_from_cli(path=None):
            # Config rendering is daemon-free; command() only records the up intent.
            result = subprocess.run(compose(path) + ['config', '--no-interpolate', '--no-env-resolution',
                '--format', 'json'], check=True, capture_output=True, timeout=10)
            return json.loads(result.stdout)
        self.raw.model, self.raw.compose = model_from_cli, compose
        self.host.up(IMAGES, self.sources, self.path, self.raw.fingerprint, 'frontend')
        rendered = model_from_cli(self.path)
        managed = {item['target']: item for item in rendered['services']['frontend']['volumes']
                   if item['target'] in MOUNTS}
        self.assertEqual({target: item['source'] for target, item in managed.items()}, self.sources)
        self.assertTrue(all(item['read_only'] is True for item in managed.values()))
        self.assertIs(managed['/usr/share/nginx/public']['bind']['create_host_path'], False)
        self.assertEqual(len(self.raw.calls), 1)
        self.assertEqual(self.raw.calls[0][-7:], ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'frontend'])


if __name__ == '__main__':
    unittest.main()
