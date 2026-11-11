"""Synthetic retained fingerprint and fixed probe-version compatibility."""
import copy
import json
import time
import unittest
from unittest.mock import patch

from contract import Denied, canonical, digest
from operator_adapter import dispatch
from worker_host import SERVICE, WorkerHost

LEGACY = 'sha256:48989ed953ae03a93c7e873478bc181ae2868ac13dafbae22802182946c3a2ea'
COHORT_V1 = 'sha256:cb788b97f4276119ecc766af59420b0aeda163f66a5eb676ce8ab601a432dca1'


class WorkerPolicyTests(unittest.TestCase):
    def setUp(self):
        self.value = {'Id': 'c' * 64, 'Image': 'sha256:' + 'd' * 64,
            'Config': {'Env': ['JEV=unchanged', 'INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=true'],
                       'Labels': {'com.docker.compose.project': 'TEST-worker-policy',
                                  'com.docker.compose.service': SERVICE}},
            'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0}},
            'Mounts': [], 'RestartCount': 0, 'State': {'Running': True, 'Restarting': False}}
        self.binding = {'container_id': self.value['Id'], 'image_id': self.value['Image'],
            'sha': 'b' * 40, 'runtime_sha256': LEGACY,
            'restart_policy_sha256': digest(self.value['HostConfig']['RestartPolicy'])}
        self.config = type('Config', (), {'core': {'project': 'TEST-worker-policy'}, 'recheck': lambda self: None})()

    def call(self, verb, binding, value=None):
        value = copy.deepcopy(value if value is not None else self.value)
        class Runner:
            end = time.monotonic() + 5
            def run(self, argv, **kwargs):
                if argv[1] == 'inspect': return canonical([value])
                if argv[1:3] == ['image', 'inspect']:
                    return canonical({'org.opencontainers.image.revision': binding['sha']})
                raise AssertionError(argv)
        with patch.object(WorkerHost, 'signal_ready', return_value=True):
            return json.loads(dispatch(verb, binding, self.config, Runner()))

    def test_legacy_probe_retains_frozen_raw_env_hash_and_no_cohort_fallback(self):
        self.assertEqual(WorkerHost.policy(self.value), LEGACY)
        self.assertTrue(self.call('worker-probe', self.binding)['ready'])
        reordered = copy.deepcopy(self.value); reordered['Config']['Env'].reverse()
        with self.assertRaisesRegex(Denied, 'worker-probe-binding'):
            self.call('worker-probe', self.binding, reordered)
        self.assertNotEqual(WorkerHost.cohort_policy_v1(self.value), LEGACY)

    def test_cohort_probe_v1_accepts_order_only_and_rejects_legacy_hash(self):
        before = copy.deepcopy(self.value)
        self.assertEqual(WorkerHost.cohort_policy_v1(self.value), COHORT_V1)
        self.assertEqual(self.value, before)
        binding = {**self.binding, 'runtime_sha256': COHORT_V1}
        self.assertTrue(self.call('cohort-worker-probe-v1', binding)['ready'])
        reordered = copy.deepcopy(self.value); reordered['Config']['Env'].reverse()
        self.assertTrue(self.call('cohort-worker-probe-v1', binding, reordered)['ready'])
        self.assertEqual(self.value, before)
        with self.assertRaisesRegex(Denied, 'worker-probe-binding'):
            self.call('cohort-worker-probe-v1', self.binding)
        with self.assertRaisesRegex(Denied, 'worker-probe-binding'):
            self.call('worker-probe', binding)

    def test_cohort_probe_rejects_values_duplicates_and_malformed_entries(self):
        binding = {**self.binding, 'runtime_sha256': WorkerHost.cohort_policy_v1(self.value)}
        for entry in ('NEW=value', 'JEV=unchanged', 'JEV=changed', 'malformed'):
            changed = copy.deepcopy(self.value); changed['Config']['Env'].append(entry)
            with self.subTest(entry=entry), self.assertRaises(Denied):
                self.call('cohort-worker-probe-v1', binding, changed)
        for env in (None, []):
            value = copy.deepcopy(self.value); value['Config']['Env'] = env
            self.assertEqual(WorkerHost.cohort_policy_v1(value), WorkerHost.policy(value))


if __name__ == '__main__': unittest.main()
