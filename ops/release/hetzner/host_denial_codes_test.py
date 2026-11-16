"""The release client may publish only listed constant host reasons; keep that list complete."""
import ast
import json
from pathlib import Path
import re
import unittest

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


if __name__ == '__main__':
    unittest.main()
