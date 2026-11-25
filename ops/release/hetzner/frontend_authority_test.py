"""GitHub metadata is independent of candidate-provided archive claims."""
import copy
import json
import time
import unittest
from unittest.mock import patch
from contract import Denied
from frontend_authority import frontend_authority, _artifact
from operator_github import GitHub, REPO

SHA, RUN, DIGEST = 'a' * 40, '123', 'sha256:' + 'b' * 64
RUN_DATA = {'id': 123, 'run_attempt': 2, 'head_sha': SHA}


def artifact():
    return {'id': 42, 'name': f'frontend-candidate-{SHA}-{RUN}-2', 'expired': False,
            'digest': DIGEST, 'size_in_bytes': 100,
            'workflow_run': {'id': 123, 'head_sha': SHA, 'head_branch': 'main',
                             'repository_id': 7, 'head_repository_id': 7}}


class FakeGitHub:
    def __init__(self, row=None): self.row = row or artifact()
    def get(self, path):
        if path == '': return {'id': 7, 'full_name': REPO}
        return {'total_count': 1, 'artifacts': [copy.deepcopy(self.row)]}
    def main(self): return SHA
    def run(self, *args): return RUN_DATA
    def jobs(self, run): return [{'conclusion': 'success'}]
    def legacy(self): return 'disabled_manually'


class FrontendAuthorityTests(unittest.TestCase):
    def test_repository_endpoint_has_no_trailing_slash(self):
        class Config:
            recheck = lambda self: None
        class Runner:
            def __init__(self): self.calls = []
            def run(self, argv, **kwargs): self.calls.append(argv); return b'{}'
        runner = Runner()
        self.assertEqual(GitHub(Config(), runner).get(''), {})
        self.assertEqual(runner.calls[0][-1], 'https://api.github.com/repos/' + REPO)

    def test_independent_run_attempt_repository_and_digest_binding(self):
        fake = FakeGitHub()
        with patch('frontend_authority.GitHub', return_value=fake):
            result = frontend_authority(type('Config', (), {'recheck': lambda self: None})(), None,
                                        {'sha': SHA, 'ci_run_id': RUN})
        self.assertEqual(result, {'sha': SHA, 'ci_run_id': RUN, 'ci_run_attempt': '2',
            'artifact_id': '42', 'artifact_name': fake.row['name'], 'artifact_sha256': DIGEST, 'artifact_bytes': 100})

    def test_operator_dispatch_preserves_exact_authority(self):
        from operator_adapter import dispatch, request
        binding = {'sha': SHA, 'ci_run_id': RUN}
        expected = {'artifact_id': '42', 'artifact_sha256': DIGEST}
        config = type('Config', (), {'recheck': lambda self: None})()
        runner = type('Runner', (), {'end': time.monotonic() + 5})()
        self.assertEqual(request('frontend-authority', json.dumps(binding).encode()), binding)
        with patch('frontend_authority.frontend_authority', return_value=expected):
            result = json.loads(dispatch('frontend-authority', binding, config, runner))
        self.assertEqual(result['artifact_id'], '42')
        self.assertEqual(result['sha'], SHA)
        self.assertEqual(result['version'], 1)

    def test_changed_or_foreign_artifacts_are_denied(self):
        for change in ({'expired': True}, {'digest': 'sha256:' + 'x' * 64}, {'size_in_bytes': 300000001},
                       {'name': 'frontend-candidate-other'}, {'workflow_run': {'id': 123}}):
            row = artifact(); row.update(change)
            with self.subTest(change=change), self.assertRaises(Denied):
                _artifact(FakeGitHub(row), RUN_DATA, 7)

    def test_replaced_artifact_between_observations_is_denied(self):
        fake = FakeGitHub(); count = 0
        original = fake.get
        def get(path):
            nonlocal count
            result = original(path)
            if path:
                count += 1
                if count == 2: result['artifacts'][0]['digest'] = 'sha256:' + 'e' * 64
            return result
        fake.get = get
        with patch('frontend_authority.GitHub', return_value=fake), self.assertRaisesRegex(Denied, 'frontend-authority-race'):
            frontend_authority(type('Config', (), {'recheck': lambda self: None})(), None,
                               {'sha': SHA, 'ci_run_id': RUN})


if __name__ == '__main__': unittest.main()
