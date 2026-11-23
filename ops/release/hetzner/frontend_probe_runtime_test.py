"""Runtime probe composition uses fixed bounded commands, without network or Docker."""
import json
import unittest
from contract import Denied
from frontend_probe_runtime import make_runtime_frontend_probe
from frontend_probe_test import ADMIN_SHA, BINDING, Fixture, PUBLIC_SHA


class FrontendRuntimeTests(unittest.TestCase):
    def test_runtime_binds_inspect_and_injected_bounded_transports(self):
        fixture, calls = Fixture(), []
        class Runner:
            def run(self, argv, limit):
                calls.append((argv, limit))
                return json.dumps([fixture.value]).encode()
        callback = make_runtime_frontend_probe(Runner, fixture.http, fixture.marker)
        self.assertTrue(callback(BINDING)['ready'])
        self.assertEqual(len(calls), 2)
        for command, limit in calls:
            self.assertEqual(command[1:], ['inspect', BINDING['container_id']])
            self.assertEqual(limit, 2 * 1024**2)
        self.assertEqual(PUBLIC_SHA, BINDING['public_sha'])
        self.assertEqual(ADMIN_SHA, BINDING['admin_sha'])

    def test_bad_inspect_cannot_prove_readiness(self):
        class Runner:
            def run(self, argv, limit): return b'[]'
        fixture = Fixture()
        with self.assertRaisesRegex(Denied, 'frontend-probe-inspect-unavailable'):
            make_runtime_frontend_probe(Runner, fixture.http, fixture.marker)(BINDING)
        self.assertEqual(fixture.http_calls, [])


if __name__ == '__main__': unittest.main()
