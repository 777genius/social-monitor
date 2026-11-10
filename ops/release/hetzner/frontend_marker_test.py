"""Marker reads are limited to one fixed container path and a bounded response."""
import unittest
from contract import Denied
from frontend_marker import PATH, read_admin_marker


class Runner:
    def __init__(self, raw): self.raw, self.calls = raw, []
    def run(self, argv, limit):
        self.calls.append((argv, limit))
        return self.raw


class FrontendMarkerTests(unittest.TestCase):
    def test_exact_container_and_marker(self):
        runner = Runner(b'a' * 40 + b'\n')
        value = read_admin_marker('b' * 64, path=PATH, max_bytes=41, timeout_seconds=5, runner=runner)
        self.assertEqual(value, b'a' * 40 + b'\n')
        self.assertEqual(runner.calls[0][0][1:], ['exec', 'b' * 64, '/bin/cat', PATH])
        self.assertEqual(runner.calls[0][1], 41)

    def test_bad_identity_path_budget_or_marker_denied(self):
        for ident, path, limit, timeout, raw in (
                ('bad', PATH, 41, 5, b'a' * 40 + b'\n'),
                ('b' * 64, '/other', 41, 5, b'a' * 40 + b'\n'),
                ('b' * 64, PATH, 42, 5, b'a' * 40 + b'\n'),
                ('b' * 64, PATH, 41, 6, b'a' * 40 + b'\n'),
                ('b' * 64, PATH, 41, 5, b'bad')):
            with self.subTest(path=path, limit=limit, timeout=timeout), self.assertRaises(Denied):
                read_admin_marker(ident, path=path, max_bytes=limit, timeout_seconds=timeout, runner=Runner(raw))


if __name__ == '__main__': unittest.main()
