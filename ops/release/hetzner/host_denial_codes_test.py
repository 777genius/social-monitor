"""The release client may publish only listed constant host reasons; keep that list complete."""
import ast
import json
from pathlib import Path
import re
import subprocess
import unittest
from unittest import mock

from contract import Denied
from host import Host

HERE = Path(__file__).resolve().parent
PUBLISHED = HERE / 'host_denial_codes.json'
REASON = re.compile(r'[a-z][a-z0-9-]{0,127}')


def host_reasons():
    """Constant reasons from require(cond, 'reason') and Denied('reason') in production host modules."""
    found = {}
    for path in sorted(HERE.glob('*.py')):
        if path.name.endswith('_test.py') or path.name.startswith('test_'):
            continue
        for node in ast.walk(ast.parse(path.read_text(), filename=path.name)):
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'reason'
                                                    for t in node.targets):
                # Fallback payload reasons, e.g. reason = str(error) if ... else 'archive-invalid'.
                for part in ast.walk(node.value):
                    if (isinstance(part, ast.Constant) and isinstance(part.value, str)
                            and REASON.fullmatch(part.value)):
                        found.setdefault(part.value, path.name)
            if not isinstance(node, ast.Call):
                continue
            name = node.func.id if isinstance(node.func, ast.Name) else getattr(node.func, 'attr', None)
            if name not in ('require', 'Denied') or not node.args:
                continue
            last = node.args[-1] if name == 'require' and len(node.args) > 1 else node.args[0]
            if isinstance(last, ast.Constant) and isinstance(last.value, str) and REASON.fullmatch(last.value):
                found.setdefault(last.value, path.name)
    return found


def published_codes():
    return json.loads(PUBLISHED.read_text())


class HostDenialCodeTests(unittest.TestCase):
    def test_every_constant_host_reason_is_published(self):
        published = set(published_codes())
        missing = {code: module for code, module in host_reasons().items() if code not in published}
        self.assertEqual(missing, {})

    def test_published_codes_are_unique_constants(self):
        codes = published_codes()
        self.assertEqual(len(codes), len(set(codes)))
        self.assertTrue(all(REASON.fullmatch(code) for code in codes))


class HostCommandDenialTests(unittest.TestCase):
    """A failing host command must name its family, never its arguments or output."""

    def denial(self, argv, error):
        with mock.patch('host.subprocess.run', side_effect=error):
            with self.assertRaises(Denied) as caught:
                Host({}).command(argv)
        return str(caught.exception)

    def test_failure_names_the_command_family(self):
        failed = subprocess.CalledProcessError(1, 'x')
        docker = '/usr/bin/docker'
        cases = {
            'host-compose-config-failed': [docker, 'compose', '--project-name', 'p', 'config'],
            'host-compose-failed': [docker, 'compose', '--project-name', 'p', 'up'],
            'host-image-load-failed': [docker, 'image', 'load', '--input', '/x'],
            'host-docker-inspect-failed': [docker, 'inspect', 'id'],
            'host-systemctl-failed': ['/usr/bin/systemctl', 'show', 'u'],
            'host-command-failed': ['/opt/adapter', 'verb'],
        }
        for expected, argv in cases.items():
            self.assertEqual(self.denial(argv, failed), expected)
        self.assertTrue(set(cases) <= set(published_codes()))

    def test_timeout_is_distinct_from_failure(self):
        self.assertEqual(self.denial(['/usr/bin/docker', 'ps'], subprocess.TimeoutExpired('x', 180)),
                         'host-command-timeout')


if __name__ == '__main__':
    unittest.main()
