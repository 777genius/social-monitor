"""Exact stopped-process marker and deployed source capability, no Docker effects."""
import copy
import json
import unittest
from contract import Denied, canonical, digest
from operator_probe import worker_drain, worker_capability
from backend_host import BackendHost
from worker_host import SERVICE

ID, IMAGE = 'a' * 64, 'sha256:' + 'b' * 64
SOURCE = '2e4f6131799125e3098bbdab8701b7380123ea2841799ebe932f190c21cb9d11'


class Config:
    core = {'project': 'test-project'}
    recheck = lambda self: None


class Runner:
    def __init__(self):
        self.value = {'Id': ID, 'Image': IMAGE, 'RestartCount': 0,
            'Config': {'Labels': {'com.docker.compose.project': 'test-project',
                'com.docker.compose.service': SERVICE}},
            'HostConfig': {'RestartPolicy': {'Name': 'no', 'MaximumRetryCount': 0}},
            'State': {'Running': False, 'Restarting': False, 'OOMKilled': False, 'ExitCode': 143,
                'StartedAt': '2026-11-10T00:00:00Z', 'FinishedAt': '2026-11-10T01:00:01Z'}}
        self.marker = {'marker': 'social-monitor-worker-modules-drained-v1', 'signal': 'SIGTERM',
                       'pid': 1, 'completed_at_ms': 1794272400500}
        self.source, self.calls = SOURCE, []

    def run(self, argv, **kwargs):
        self.calls.append(argv)
        if 'inspect' in argv: return canonical([self.value])
        if 'logs' in argv: return canonical(self.marker) + b'\n'
        if 'sha256sum' in argv:
            return (self.source + '  /app/node_modules/@nestjs/core/nest-application-context.js\n').encode()
        if '/bin/sh' in argv: return b''
        raise AssertionError(argv)


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.runner = Runner()
        self.binding = {'container_id': ID, 'image_id': IMAGE,
            'signal_since_ms': '1794272400000', 'restart_count': '0',
            'started_at_sha256': digest(self.runner.value['State']['StartedAt'])}

    def test_completed_sigterm_143_requires_exact_marker_and_source_lifecycle(self):
        self.assertTrue(worker_drain(Config(), self.runner, self.binding)['drained'])
        logs = next(call for call in self.runner.calls if 'logs' in call)
        self.assertIn('--since', logs); self.assertIn('--tail', logs); self.assertIn(ID, logs)

    def test_wrong_or_future_prior_marker_never_proves_drain(self):
        for mutate in (lambda r: r.marker.update(completed_at_ms=1794272399999),
                       lambda r: r.marker.update(completed_at_ms=1794272402000),
                       lambda r: r.marker.update(pid=2), lambda r: r.marker.update(signal='SIGINT'),
                       lambda r: r.value.update(RestartCount=1),
                       lambda r: r.value['State'].update(OOMKilled=True),
                       lambda r: r.value['State'].update(ExitCode=137),
                       lambda r: r.value['State'].update(StartedAt='2026-11-10T00:00:01Z')):
            self.runner = Runner(); mutate(self.runner)
            with self.subTest(mutate=mutate), self.assertRaises(Denied):
                worker_drain(Config(), self.runner, self.binding)

    def test_markerless_143_is_not_success(self):
        self.runner.marker = {'other': 'log'}
        with self.assertRaisesRegex(Denied, 'worker-drain-marker'):
            worker_drain(Config(), self.runner, self.binding)

    def test_capability_requires_exact_guarded_nest_source_and_live_container(self):
        self.runner.value['State']['Running'] = True
        result = worker_capability(Config(), self.runner, {'container_id': ID, 'image_id': IMAGE})
        self.assertEqual(result['signal_replay'], 'nest-guarded-v1')
        self.assertFalse(any('node' in call and 'exec' in call for call in self.runner.calls))
        self.runner.source = '0' * 64
        with self.assertRaisesRegex(Denied, 'worker-signal-replay-source'):
            worker_capability(Config(), self.runner, {'container_id': ID, 'image_id': IMAGE})

    def test_created_and_started_oom_defaults_match_but_disabling_does_not(self):
        value = {'Config': {'Env': ['PAUSED=true']}, 'Mounts': [],
                 'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0},
                                'OomKillDisable': None, 'ReadonlyRootfs': True}}
        for service in ('api', SERVICE):
            started = BackendHost.policy(value, service)
            created = copy.deepcopy(value); created['HostConfig']['OomKillDisable'] = False
            self.assertEqual(BackendHost.policy(created, service), started)
            created['HostConfig']['OomKillDisable'] = True
            self.assertNotEqual(BackendHost.policy(created, service), started)
            created['HostConfig']['OomKillDisable'] = None
            created['HostConfig']['ReadonlyRootfs'] = False
            self.assertNotEqual(BackendHost.policy(created, service), started)

    def test_capability_absent_old_image_fails(self):
        self.runner.value['State']['Running'] = True
        run = self.runner.run
        def missing(argv, **kwargs):
            if '/bin/sh' in argv: raise Denied('operator-command-failed')
            return run(argv, **kwargs)
        self.runner.run = missing
        with self.assertRaises(Denied): worker_capability(Config(), self.runner,
                                                         {'container_id': ID, 'image_id': IMAGE})
