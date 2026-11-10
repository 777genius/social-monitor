"""All lanes must fence an unfinished full-cohort transaction."""
import tempfile
import unittest
from pathlib import Path
from contract import Denied, atomic
from controller import Controller


class CohortInterlockTests(unittest.TestCase):
    def test_only_exact_cohort_recovery_can_cross_unfinished_cohort(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            pending = state / 'cohort' / 'transactions'
            pending.mkdir(parents=True)
            atomic(pending / 'first.json', {'outcome': None})
            core = Controller({'state': str(state), 'inbox': str(state / 'inbox')}, None)
            core.exclusive('cohort-first')
            for key in ('legacy-first', 'backend-first', 'cohort-second'):
                with self.subTest(key=key), self.assertRaisesRegex(Denied, 'unfinished-cohort-release'):
                    core.exclusive(key)
            for invalid in (False, 'starting', {}):
                atomic(pending / 'first.json', {'outcome': invalid})
                with self.subTest(outcome=invalid), self.assertRaisesRegex(Denied, 'unfinished-cohort-release'):
                    core.exclusive('legacy-first')
            atomic(pending / 'first.json', {'outcome': 'rolled-back'})
            core.exclusive('legacy-first')
            core.exclusive('backend-first')
            core.exclusive('cohort-second')

    def test_another_unfinished_cohort_blocks_even_same_transaction(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            pending = state / 'cohort' / 'transactions'
            pending.mkdir(parents=True)
            atomic(pending / 'first.json', {'outcome': None})
            atomic(pending / 'second.json', {'outcome': None})
            core = Controller({'state': str(state), 'inbox': str(state / 'inbox')}, None)
            with self.assertRaisesRegex(Denied, 'unfinished-cohort-release'):
                core.exclusive('cohort-first')


if __name__ == '__main__':
    unittest.main()
