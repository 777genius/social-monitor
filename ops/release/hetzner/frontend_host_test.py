"""The frontend update must not change the API, worker or unrelated mounts."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from contract import Denied
from frontend_host import FrontendHost, MOUNTS


def model():
    volumes = [{'type': 'bind', 'source': '/trusted/old/' + name, 'target': target,
                'read_only': True} for target, (name, _) in MOUNTS.items()]
    volumes.append({'type': 'bind', 'source': '/trusted/secret', 'target': '/secret', 'read_only': True})
    return {'services': {'api': {'image': 'api-image'}, 'frontend': {'image': 'frontend-image',
            'environment': {'MODE': 'same'}, 'volumes': volumes}, 'worker': {'image': 'worker-image'}}}


class FakeHost:
    def __init__(self):
        self.c = {'project': 'test-project'}
        self.before = model()
        self.after = copy.deepcopy(self.before)
        self.calls = []
        self.fingerprint = 'trusted'

    def model(self, override=None):
        return copy.deepcopy(self.before if override is None else self.after)

    def compose_fingerprint(self):
        return self.fingerprint

    def compose(self, override):
        return ['docker', 'compose', '-f', str(override)]

    def command(self, argv):
        self.calls.append(argv)


class FrontendHostTests(unittest.TestCase):
    def test_only_three_readonly_frontend_mount_sources_can_change(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for target, (name, is_directory) in MOUNTS.items():
                path = root / name
                path.mkdir() if is_directory else path.write_text('synthetic')
            host = FakeHost()
            host.before['services']['frontend']['volumes'][0]['bind'] = {'create_host_path': False}
            host.after = copy.deepcopy(host.before)
            for entry in host.after['services']['frontend']['volumes']:
                if entry['target'] in MOUNTS:
                    entry['source'] = str(root / MOUNTS[entry['target']][0])
            changed = copy.deepcopy(host.after)
            with patch('frontend_host.trusted', side_effect=lambda path, directory=False: Path(path)):
                FrontendHost(host).up(root, root / 'override.json', 'trusted')
                self.assertEqual(host.calls[0][-7:], ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'frontend'])
                override = json.loads((root / 'override.json').read_text())
                self.assertEqual(override['services']['frontend']['volumes'][0]['bind'], {'create_host_path': False})
                with self.assertRaisesRegex(Denied, 'frontend-interpolated-path'):
                    FrontendHost(host).up(root / '${SLOT}', root / 'override.json', 'trusted')
                for kind in ('api', 'secret', 'read-only', 'wrong-source', 'fingerprint'):
                    host.after = copy.deepcopy(changed)
                    host.fingerprint = 'trusted'
                    if kind == 'api': host.after['services']['api']['image'] = 'other'
                    if kind == 'secret': host.after['services']['frontend']['volumes'][-1]['source'] = '/other'
                    if kind == 'read-only': host.after['services']['frontend']['volumes'][0]['read_only'] = False
                    if kind == 'wrong-source': host.after['services']['frontend']['volumes'][0]['source'] = '/other'
                    if kind == 'fingerprint': host.fingerprint = 'other'
                    with self.subTest(kind=kind), self.assertRaises(Denied):
                        FrontendHost(host).up(root, root / 'override.json', 'trusted')
                self.assertEqual(len(host.calls), 1)

    def test_previous_sources_are_exact_readonly_trusted_and_pin_verifier(self):
        host = FakeHost()
        inspected = {'Id': 'a' * 64, 'RestartCount': 0, 'State': {'Pid': 123, 'Running': True, 'StartedAt': 'now'},
                     'Mounts': [{'Destination': target, 'Source': '/trusted/old/' + name,
                                  'Type': 'bind', 'RW': False} for target, (name, _) in MOUNTS.items()]}
        host.docker = lambda *args: json.dumps([inspected]).encode()
        with patch('frontend_host.trusted', side_effect=lambda path, directory=False: Path(path)), \
             patch('frontend_host.os.stat', return_value=SimpleNamespace(st_dev=1, st_ino=2)), \
             patch('frontend_host.private_file_digest', return_value='sha256:fixture') as digest:
            result = FrontendHost(host).current_sources(inspected)
            self.assertEqual(set(result['sources']), set(MOUNTS))
            self.assertEqual(result['verifier_sha256'], 'sha256:fixture')
            digest.assert_called_once_with('/trusted/old/verify-static-release.sh')
            for index in range(3):
                stats = [SimpleNamespace(st_dev=1, st_ino=2) for _ in range(index * 2 + 2)]
                stats[-1] = SimpleNamespace(st_dev=1, st_ino=3)
                with self.subTest(inode_target=index), patch('frontend_host.os.stat', side_effect=stats):
                    with self.assertRaisesRegex(Denied, 'frontend-live-inode-drift'):
                        FrontendHost(host).current_sources(inspected)
            host.after = model()
            host.after['services']['frontend']['volumes'][0]['source'] = '/trusted/new/public'
            live_override = copy.deepcopy(inspected)
            live_override['Mounts'][0]['Source'] = '/trusted/new/public'
            with self.assertRaisesRegex(Denied, 'frontend-live-mount-drift'):
                FrontendHost(host).current_sources(live_override)
            self.assertEqual(FrontendHost(host).current_sources(live_override, 'verified-override')['sources'][
                '/usr/share/nginx/public'], '/trusted/new/public')
            for alteration in ('writeable', 'duplicate', 'interpolation', 'live-drift', 'model-shadow', 'live-shadow'):
                host.before = model()
                if alteration == 'writeable': host.before['services']['frontend']['volumes'][0]['read_only'] = False
                if alteration == 'duplicate': host.before['services']['frontend']['volumes'].append(
                    copy.deepcopy(host.before['services']['frontend']['volumes'][0]))
                if alteration == 'interpolation': host.before['services']['frontend']['volumes'][0]['source'] = '/trusted/${BAD}'
                live = copy.deepcopy(inspected)
                if alteration == 'live-drift': live['Mounts'][0]['Source'] = '/trusted/other'
                if alteration == 'model-shadow': host.before['services']['frontend']['volumes'].append(
                    {'target': '/usr/share/nginx/public/main.dart.js', 'type': 'bind', 'read_only': True})
                if alteration == 'live-shadow': live['Mounts'].append(
                    {'Destination': '/usr/share/nginx/public/main.dart.js', 'Type': 'bind', 'RW': False})
                with self.subTest(alteration=alteration), self.assertRaises(Denied):
                    FrontendHost(host).current_sources(live)

    def test_snapshot_excludes_only_frontend_and_keeps_api(self):
        host = FakeHost()
        host.snapshot = lambda: ({'containers': {'f': {'id': 'f', 'service': 'frontend', 'project': 'test-project'},
            'w': {'id': 'w', 'service': 'worker', 'project': 'test-project'}}, 'units': {}},
            {'id': 'a', 'service': 'api', 'project': 'test-project'})
        snapshot, target = FrontendHost(host).snapshot()
        self.assertEqual(target['id'], 'f')
        self.assertEqual(set(snapshot['containers']), {'a', 'w'})


if __name__ == '__main__':
    unittest.main()
