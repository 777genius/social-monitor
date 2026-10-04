"""Fixed-root admission and daemon-free reproduction of untracked include env drift."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
import yaml
from compose_contract import MAX_BYTES, MAX_EVENTS, fixed_roots
from contract import Denied
from host import Host
from test_support import SHA, RUN, PREVIOUS, setup, receive, run


class ConfigOnlyHost(Host):
    """Synthetic files; real Compose config, with every mutating command intercepted."""
    def __init__(self, config):
        super().__init__(config)
        self.ups = []

    def private_digest(self, path):
        return 'sha256:' + hashlib.sha256(Path(path).read_bytes()).hexdigest()

    def command(self, argv, data=None):
        if 'up' in argv:
            self.ups.append(argv)
            return b''
        if 'config' not in argv:
            raise AssertionError('Only daemon-free config is allowed')
        return super().command(argv, data)


class ComposeFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.config = setup(self.root)
        self.host = ConfigOnlyHost(self.config)
        self.source = Path(self.config['compose_files'][0])

    def tearDown(self):
        self.tmp.cleanup()

    def validate(self, text):
        self.source.write_text(text)
        fixed_roots([str(self.source)], self.host.private_digest)



class ComposeContract(ComposeFixture):
    # Real YAML/JSON decoding must inspect escaped keys, aliases and merge sources.
    def test_include_spellings_aliases_and_merges_rejected(self):
        cases = [
            'include: [nested.yaml]\nservices: {}',
            "'include': [nested.yaml]\nservices: {}",
            '"incl\\u0075de": [nested.yaml]\nservices: {}',
            '{"incl\\u0075de": ["nested.yaml"], "services": {}}',
            'x-base: &base {include: [nested.yaml]}\n<<: *base\nservices: {}',
            'x-base: &base {"incl\\x75de": [nested.yaml]}\n<<: [*base]\nservices: {}',
            'x-key: &key include\n*key: [nested.yaml]\nservices: {}',
        ]
        for text in cases:
            with self.subTest(text=text), self.assertRaisesRegex(Denied, 'compose-dependency-unsupported'):
                self.validate(text)

    # Both same-file and external extends are outside the fixed-root contract.
    def test_extends_plain_escaped_and_merged_rejected(self):
        for value in ('{file: external.yaml, service: base}', 'base'):
            for text in (
                'services: {api: {extends: ' + value + '}}',
                'services: {api: {"ext\\u0065nds": ' + value + '}}',
                'x-base: &base {extends: ' + value + '}\nservices: {api: {<<: *base}}',
            ):
                with self.subTest(text=text), self.assertRaisesRegex(Denied, 'compose-dependency-unsupported'):
                    self.validate(text)

    # Unsupported/ambiguous YAML never falls back to regex or constructs tagged objects.
    def test_ambiguous_custom_tag_and_cycles_fail_closed(self):
        for text in ('services: {}\nservices: {}', 'services: !reset {}',
                     'services: !!python/object:builtins.object {}',
                     'services: &loop {api: *loop}', 'services: {}\n---\nservices: {}',
                     'services: {api: {<<: invalid}}', 'services: {true: {}}', 'services: ['):
            with self.subTest(text=text), self.assertRaises(Denied):
                self.validate(text)

    # Size, parser events, nesting and alias edges have finite admission budgets.
    def test_structure_limits(self):
        for text in ('#' * (MAX_BYTES + 1), 'services: ' + '[' * 65 + ']' * 65,
                     'x-many: [' + ','.join('item' for _ in range(MAX_EVENTS)) + ']\nservices: {}',
                     'x-base: &base {}\nx-many: [' + ','.join('*base' for _ in range(MAX_EVENTS))
                     + ']\nservices: {}'):
            with self.assertRaisesRegex(Denied, 'compose-structure-limit'):
                self.validate(text)

    # Missing or wrong-version parser prevents both candidate and previous-image up.
    def test_parser_unavailable_and_version_drift_block_both_up_paths(self):
        for image in ('sha256:' + 'a' * 64, PREVIOUS):
            with patch.dict(sys.modules, {'yaml': None}), self.assertRaisesRegex(Denied, 'compose-parser-unavailable'):
                self.host.up(image, self.root / 'override.json', 'unused')
            with patch.object(yaml, '__version__', '6.0.1'), self.assertRaisesRegex(Denied, 'compose-parser-version'):
                self.host.up(image, self.root / 'override.json', 'unused')
        self.assertEqual(self.host.ups, [])

    # Fixed roots may use ordinary aliases/merges and JSON; fingerprints still bind raw bytes.
    def test_benign_yaml_and_json_multiple_roots_supported(self):
        self.validate('x-base: &base {image: sandbox:base}\nservices: {api: {<<: *base}}')
        second = self.root / 'second.json'
        second.write_text('{"services":{"api":{"environment":{"MODE":"one"}}}}')
        fixed_roots([str(self.source), str(second)], self.host.private_digest)

    # Controller activation and explicit rollback cannot execute up after include appears.
    def test_controller_include_drift_blocks_activation_and_rollback(self):
        self.assertEqual(receive(self.root)[0].returncode, 0)
        self.assertEqual(run(self.root, f'admit {SHA} {RUN}').returncode, 0)
        original = self.source.read_bytes()
        nested = self.root / 'nested.yaml'
        nested.write_text('services: {api: {image: sandbox:base, environment: {MODE: "${MODE}"}}}')
        env = self.root / 'nested.env'
        env.write_text('MODE=one\n')
        include = 'include:\n  - path: nested.yaml\n    env_file: nested.env\n'
        self.source.write_text(include)
        env.write_text('MODE=two\n')
        result = run(self.root, f'activate {SHA} {RUN}')
        self.assertEqual(result.returncode, 1, (result.stdout, result.stderr))
        self.assertEqual(json.loads(result.stdout)['denied'], 'compose-dependency-unsupported')
        commands = (self.root / 'commands.jsonl').read_text()
        self.assertNotIn('"up"', commands)
        self.assertNotIn('"load"', commands)
        self.source.write_bytes(original)
        result = run(self.root, f'activate {SHA} {RUN}')
        self.assertEqual(result.returncode, 0, (result.stdout, result.stderr))
        before = (self.root / 'commands.jsonl').read_text().count('"up"')
        self.source.write_text(include)
        env.write_text('MODE=three\n')
        result = run(self.root, f'rollback {SHA} {RUN}')
        self.assertEqual(result.returncode, 1, (result.stdout, result.stderr))
        self.assertIn(json.loads(result.stdout)['denied'],
                      ('compose-dependency-unsupported', 'rollback-failed-latched'))
        self.assertEqual((self.root / 'commands.jsonl').read_text().count('"up"'), before)


@unittest.skipUnless(shutil.which('docker'), 'Docker Compose binary required for daemon-free config proof')
class RealCompose(ComposeFixture):
    def raw_model(self, normalized=False):
        options = ['--no-interpolate', '--no-env-resolution'] if normalized else []
        return json.loads(self.host.command(self.host.compose() + ['config', *options, '--format', 'json']))

    # Reproduce the review: expanded MODE changes, normalized model and selected inputs do not.
    def test_real_nested_include_env_drift_blocked_before_both_up_paths(self):
        (self.root / 'nested.yaml').write_text(
            'services: {api: {image: sandbox:base, environment: {MODE: "${MODE}"}}}')
        nested_env = self.root / 'nested.env'
        nested_env.write_text('MODE=one\n')
        self.source.write_text('include:\n  - path: nested.yaml\n    env_file: nested.env\n')
        normalized = self.raw_model(normalized=True)
        root_hashes = [self.host.private_digest(p) for p in self.config['compose_files'] + self.config['env_files']]
        self.assertEqual(self.raw_model()['services']['api']['environment']['MODE'], 'one')
        nested_env.write_text('MODE=two\n')
        self.assertEqual(self.raw_model()['services']['api']['environment']['MODE'], 'two')
        self.assertEqual(self.raw_model(normalized=True), normalized)
        self.assertEqual([self.host.private_digest(p) for p in self.config['compose_files'] + self.config['env_files']], root_hashes)
        with self.assertRaisesRegex(Denied, 'compose-dependency-unsupported'):
            self.host.compose_fingerprint()
        for image in ('sha256:' + 'a' * 64, PREVIOUS):
            with self.assertRaisesRegex(Denied, 'compose-dependency-unsupported'):
                self.host.up(image, self.root / 'override.json', 'unused')
        self.assertEqual(self.host.ups, [])

    # Ordinary explicit -f YAML+JSON composition and all three env/private byte guards remain usable.
    def test_real_fixed_roots_and_private_env_drift(self):
        self.source.write_text('x-base: &base {image: sandbox:base}\nservices:\n  api:\n'
                               '    <<: *base\n    environment: {CLI_MODE: "${CLI_MODE}"}\n')
        cli_env = Path(self.config['env_files'][0])
        cli_env.write_text('CLI_MODE=one\n')
        service_env = self.root / 'service.env'
        overlay = self.root / 'overlay.json'
        overlay.write_text(json.dumps({'services': {'api': {'env_file': [str(service_env)]}}}))
        self.config['compose_files'].append(str(overlay))
        fingerprint = self.host.compose_fingerprint()
        self.assertEqual(self.raw_model()['services']['api']['environment']['CLI_MODE'], 'one')
        self.host.up(PREVIOUS, self.root / 'override.json', fingerprint)
        self.assertEqual(len(self.host.ups), 1)
        for path in (cli_env, service_env, overlay):
            original = path.read_bytes()
            path.write_bytes(original + (b'\n# changed\n' if path == overlay else b'\nDRIFT=two\n'))
            with self.assertRaisesRegex(Denied, 'trusted-compose-changed'):
                self.host.up(PREVIOUS, self.root / 'override.json', fingerprint)
            path.write_bytes(original)
        self.assertEqual(self.host.compose_fingerprint(), fingerprint)
        self.assertEqual(len(self.host.ups), 1)


    def test_real_profiled_services_relative_mount_and_inactive_private_drift(self):
        layout = self.root / 'private-api'
        layout.mkdir()
        self.config['project_directory'] = str(layout)
        self.host = ConfigOnlyHost(self.config)
        (layout / 'api-entrypoint.sh').write_text('# synthetic fixture only\n')
        worker_env = layout / 'private-worker.env'
        worker_env.write_text('WORKER_MODE=one\n')
        source = (
            'services:\n  api:\n    image: sandbox:base\n    profiles: [api]\n'
            '    volumes: ["./api-entrypoint.sh:/app/api-entrypoint.sh:ro"]\n'
            '  sibling:\n    image: sandbox:worker\n    profiles: [worker]\n'
            '    env_file: [private-worker.env]\n')
        self.source.write_text(source)
        model = self.host.model()
        self.assertEqual(set(model['services']), {'api', 'sibling'})
        self.assertEqual(model['services']['api']['profiles'], ['api'])
        self.assertEqual(model['services']['sibling']['profiles'], ['worker'])
        self.assertEqual(model['services']['api']['volumes'][0]['source'], str(layout / 'api-entrypoint.sh'))
        self.assertTrue(model['services']['api']['volumes'][0]['read_only'])
        fingerprint = self.host.compose_fingerprint()
        self.host.up(PREVIOUS, self.root / 'override.json', fingerprint)
        self.assertEqual(len(self.host.ups), 1)
        self.assertNotIn('--profile', self.host.ups[0])
        self.assertEqual(self.host.ups[0][-7:], ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'])
        worker_env.write_text('WORKER_MODE=two\n')
        with self.assertRaisesRegex(Denied, 'trusted-compose-changed'):
            self.host.up(PREVIOUS, self.root / 'override.json', fingerprint)
        worker_env.write_text('WORKER_MODE=one\n')
        self.source.write_text(source.replace('profiles: [worker]', 'profiles: [other-worker]'))
        with self.assertRaisesRegex(Denied, 'trusted-compose-changed'):
            self.host.up(PREVIOUS, self.root / 'override.json', fingerprint)
        self.assertEqual(len(self.host.ups), 1)
