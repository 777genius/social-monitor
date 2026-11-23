"""Fixed wire maps only staged paths and never accepts caller-supplied filesystem paths."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from contract import Denied, atomic
from cohort_wire import dispatch

SHA, RUN = 'a' * 40, '123'
KEY = SHA + '-' + RUN


class Engine:
    def __init__(self, core, probe): self.core, self.probe = core, probe
    def available(self): self.core.calls.append('available')
    def exclusive(self, key): self.core.calls.append(('exclusive', key))
    def admit(self, *args): self.core.calls.append(('admit', args)); return {'admitted': True}
    def activate(self, key): return {'activate': key}
    def rollback(self, key): return {'rollback': key}
    def verify(self, key): return {'verify': key}
    def receipt(self, key, rollback=False): return {'receipt': key, 'rollback': rollback}


class CohortWireTests(unittest.TestCase):
    def test_controller_dispatch_uses_fixed_grammar_and_shared_lock(self):
        from controller import Controller
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory); (state / 'controller.lock').touch()
            core = Controller({'state': str(state), 'inbox': str(state / 'inbox')}, None)
            core.fence = lambda: None
            with patch('cohort_wire.dispatch', return_value={'ok': True}) as invoked:
                self.assertEqual(core.dispatch('cohort-activate ' + SHA + ' ' + RUN), {'ok': True})
                invoked.assert_called_once_with(core, 'activate', [SHA, RUN])
            with self.assertRaises(Denied): core.dispatch('cohort-activate ' + SHA + ' ' + RUN + ' extra')

    def test_only_fixed_staged_paths_and_exact_verifier_feed_admission(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            frontend = state / 'cohort/frontend/candidates' / KEY
            backend = state / 'cohort/backend'
            (frontend / 'bundle/public').mkdir(parents=True)
            (frontend / 'bundle/admin').mkdir()
            (backend / 'imports').mkdir(parents=True)
            (backend / 'inbox').mkdir()
            atomic(frontend / 'proof.json', {'root': str(frontend / 'bundle'), 'tree_sha256': 'sha256:' + 'c' * 64})
            atomic(backend / 'imports' / (KEY + '.json'), {'sha': SHA, 'ci_run_id': RUN})
            (backend / 'inbox' / (KEY + '.tar')).write_bytes(b'synthetic')
            core = type('Core', (), {'state': state, 'calls': []})()
            def verifier(root, seal, target):
                self.assertEqual(root, frontend / 'bundle')
                self.assertEqual(seal, 'sha256:' + 'c' * 64)
                return {'path': str(target), 'sha256': 'sha256:' + 'd' * 64}
            with patch('cohort_wire.CohortRelease', Engine), patch('cohort_wire.make_runtime_frontend_probe', return_value=object()), \
                 patch('cohort_wire.trusted', side_effect=lambda path, directory=False: Path(path)), \
                 patch('cohort_wire.write_frontend_verifier', side_effect=verifier):
                self.assertEqual(dispatch(core, 'admit', [SHA, RUN]), {'admitted': True})
                args = core.calls[-1][1]
                self.assertEqual(args[3]['/usr/share/nginx/public'], str(frontend / 'bundle/public'))
                self.assertEqual(args[3]['/run/bootstrap/verify-static-release.sh'], str(state / 'cohort/verifiers' / (KEY + '.sh')))
                self.assertEqual(args[4], backend / 'inbox' / (KEY + '.tar'))
                self.assertEqual(dispatch(core, 'receipt', [KEY + '-rollback']), {'receipt': KEY, 'rollback': True})
                with self.assertRaises(Denied): dispatch(core, 'activate', ['../bad', RUN])
                with self.assertRaises(Denied): dispatch(core, 'anything', [SHA, RUN])


if __name__ == '__main__': unittest.main()
