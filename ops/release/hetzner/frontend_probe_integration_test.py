"""Compose real bounded adapters with fake command runners, without network or Docker."""
import unittest
from contract import Denied
from frontend_http import http_get
from frontend_marker import read_admin_marker
from frontend_probe import make_frontend_probe
from frontend_probe_test import ADMIN_SHA, BINDING, Fixture, PUBLIC_SHA


class FakeRunner:
    def __init__(self): self.http_calls, self.marker_calls, self.admin = [], [], (ADMIN_SHA + '\n').encode()

    def run(self, argv, limit):
        if argv[0].endswith('docker'):
            self.marker_calls.append((argv, limit))
            return self.admin
        self.http_calls.append((argv, limit))
        url = argv[-1]
        if url.startswith('https://admin.'):
            return b'auth\n401'
        if '/release-sha.txt?' in url:
            return (PUBLIC_SHA + '\n\n200').encode()
        return b'ok\n200'


class FrontendProbeIntegrationTests(unittest.TestCase):
    def test_probe_uses_fixed_adapters_and_separate_admin_marker(self):
        fixture, runner = Fixture(), FakeRunner()
        probe = make_frontend_probe(fixture.inspect,
            lambda url, **kwargs: http_get(url, runner=runner, **kwargs),
            lambda ident, **kwargs: read_admin_marker(ident, runner=runner, **kwargs))
        proof = probe(BINDING)
        self.assertTrue(proof['ready'])
        self.assertEqual(len(runner.http_calls), 4)
        self.assertEqual(len(runner.marker_calls), 1)
        runner.admin = b'e' * 40 + b'\n'
        fixture.inspect_calls.clear()
        with self.assertRaisesRegex(Denied, 'frontend-probe-admin-marker'):
            probe(BINDING)


if __name__ == '__main__': unittest.main()
