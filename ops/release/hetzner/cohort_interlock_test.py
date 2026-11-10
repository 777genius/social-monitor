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

    def test_invalid_outcomes_in_existing_lanes_also_block(self):
        from backend_controller import BackendRelease
        for family, key in (('transactions', 'cohort-next'), ('backend/transactions', 'cohort-next')):
            for invalid in (None, False, 'starting', {}):
                with self.subTest(family=family, outcome=invalid), tempfile.TemporaryDirectory() as directory:
                    state = Path(directory)
                    folder = state / family
                    folder.mkdir(parents=True)
                    atomic(folder / 'other.json', {'outcome': invalid})
                    core = Controller({'state': str(state), 'inbox': str(state / 'inbox')}, None)
                    with self.assertRaises(Denied): core.exclusive(key)
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            folder = state / 'backend' / 'transactions'
            folder.mkdir(parents=True)
            atomic(folder / 'other.json', {'outcome': 'starting'})
            core = Controller({'state': str(state), 'inbox': str(state / 'inbox')}, None)
            with self.assertRaisesRegex(Denied, 'unfinished-backend-release'):
                BackendRelease(core).exclusive('mine')

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
