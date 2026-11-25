"""The combined release cannot change unrelated Compose controls."""
import copy
import unittest
from pathlib import Path
from unittest.mock import patch
from contract import Denied
from cohort_compose import check_scope, override
from frontend_host import MOUNTS
from frontend_host_test import model
from worker_host import SERVICE


class CohortComposeTests(unittest.TestCase):
    def test_combined_delta_preserves_all_other_controls(self):
        before = model()
        before['services'][SERVICE] = before['services'].pop('worker')
        images = {'api': 'sha256:' + 'a' * 64, SERVICE: 'sha256:' + 'b' * 64}
        sources = {target: '/trusted/new/' + name for target, (name, _) in MOUNTS.items()}
        before['services']['frontend']['volumes'][0]['bind'] = {'create_host_path': False}
        with patch('cohort_compose.trusted', side_effect=lambda path, directory=False: Path(path)):
            candidate = override(before, images, sources)
        self.assertEqual(candidate['services']['frontend']['volumes'][0]['bind'], {'create_host_path': False})
        after = copy.deepcopy(before)
        for name, image in images.items(): after['services'][name]['image'] = image
        for entry in after['services']['frontend']['volumes']:
            if entry['target'] in sources: entry['source'] = sources[entry['target']]
        check_scope(before, after, images, sources)
        for fault in ('extra-image', 'env', 'mount', 'readonly', 'backend-image'):
            changed = copy.deepcopy(after)
            if fault == 'extra-image': changed['services']['frontend']['image'] = 'other'
            if fault == 'env': changed['services']['frontend']['environment']['MODE'] = 'other'
            if fault == 'mount': changed['services']['frontend']['volumes'][-1]['source'] = '/other'
            if fault == 'readonly': changed['services']['frontend']['volumes'][0]['read_only'] = False
            if fault == 'backend-image': changed['services']['api']['image'] = 'other'
            with self.subTest(fault=fault), self.assertRaises(Denied):
                check_scope(before, changed, images, sources)


if __name__ == '__main__':
    unittest.main()
