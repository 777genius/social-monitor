"""Readiness contracts only: injected synthetic responses, no network or Docker."""
import copy
import unittest

from contract import Denied
from frontend_probe import make_frontend_probe

ID, IMAGE = 'a' * 64, 'sha256:' + 'b' * 64
PUBLIC_SHA, ADMIN_SHA = 'c' * 40, 'd' * 40
BINDING = {'container_id': ID, 'image_id': IMAGE, 'project': 'test-cohort',
    'public_sha': PUBLIC_SHA, 'admin_sha': ADMIN_SHA, 'verifier_sha256': 'sha256:' + 'e' * 64}
PUBLIC_URLS = ['https://social-monitor.app/', 'https://social-monitor.app/favicon.svg',
              'https://social-monitor.app/release-sha.txt?release=' + PUBLIC_SHA,
              'https://admin.social-monitor.app/']


class Fixture:
    def __init__(self):
        self.value = {'Id': ID, 'Image': IMAGE, 'RestartCount': 0, 'Config': {'Labels': {
            'com.docker.compose.project': 'test-cohort', 'com.docker.compose.service': 'frontend'}},
            'State': {'Running': True, 'Restarting': False, 'OOMKilled': False, 'Dead': False,
                      'Pid': 1234, 'StartedAt': '2026-11-10T00:00:00Z'}}
        self.responses = [{'status': 200, 'body': b'fixture html'}, {'status': 200, 'body': b'fixture svg'},
                          {'status': 200, 'body': (PUBLIC_SHA + '\n').encode()},
                          {'status': 401, 'body': b'fixture authentication required'}]
        self.http_calls, self.inspect_calls, self.marker_calls = [], [], []
        self.admin = (ADMIN_SHA + '\n').encode()
        self.after = None

    def inspect(self, ident):
        self.inspect_calls.append(ident)
        return copy.deepcopy(self.after if len(self.inspect_calls) > 1 and self.after is not None else self.value)

    def http(self, url, **options):
        self.http_calls.append((url, options))
        return self.responses[len(self.http_calls) - 1]

    def marker(self, ident, **options):
        self.marker_calls.append((ident, options))
        return self.admin

    def probe(self, binding=None):
        return make_frontend_probe(self.inspect, self.http, self.marker)(binding if binding is not None else BINDING)


class FrontendProbeTests(unittest.TestCase):
    def test_ready_proof_binds_distinct_rollback_shas_and_fixed_bounded_requests(self):
        fixture = Fixture()
        proof = fixture.probe()
        self.assertEqual(proof, {'ready': True, 'service': 'frontend', **BINDING,
            'public_root_status': 200, 'public_favicon_status': 200, 'public_release_sha': PUBLIC_SHA,
            'admin_root_status': 401, 'mounted_admin_sha': ADMIN_SHA})
        self.assertEqual(fixture.inspect_calls, [ID, ID])
        self.assertEqual([url for url, _ in fixture.http_calls], PUBLIC_URLS)
        for (_, settings), limit in zip(fixture.http_calls, [262144, 65536, 41, 65536]):
            self.assertEqual(settings, {'timeout_seconds': 5, 'max_bytes': limit,
                                       'follow_redirects': False, 'use_proxy': False})
        self.assertEqual(fixture.marker_calls, [(ID, {'path': '/usr/share/nginx/admin/release-sha.txt',
                                                     'max_bytes': 41, 'timeout_seconds': 5})])
        self.assertNotIn(b'fixture html', repr(proof).encode())

    def test_malformed_or_extra_binding_cannot_choose_a_url_path_or_container(self):
        for change in [{'public_sha': 'https://untrusted.invalid/'}, {'admin_sha': 'A' * 40},
                       {'container_id': '--privileged'}, {'image_id': 'tag:latest'},
                       {'project': 'Other'}, {'verifier_sha256': 'bad'}, {'url': 'https://untrusted.invalid/'}]:
            fixture = Fixture()
            with self.subTest(change=change), self.assertRaisesRegex(Denied, 'frontend-probe-binding'):
                fixture.probe({**BINDING, **change})
            self.assertEqual(fixture.inspect_calls + fixture.http_calls + fixture.marker_calls, [])

    def test_redirects_wrong_status_and_public_admin_access_inversion_deny(self):
        for index, status in [(0, 302), (0, 503), (1, 404), (2, 301), (3, 200), (3, 403)]:
            fixture = Fixture(); fixture.responses[index]['status'] = status
            with self.subTest(index=index, status=status), self.assertRaisesRegex(Denied, 'frontend-probe-http-status'):
                fixture.probe()

    def test_response_shapes_and_oversized_bodies_never_prove_ready(self):
        for response in [{'status': True, 'body': b''}, {'status': '200', 'body': b''},
                         {'status': 200, 'body': 'not bytes'}, {'status': 200, 'body': b'x' * 262145},
                         {'status': 200, 'body': b'', 'redirected': True}]:
            fixture = Fixture(); fixture.responses[0] = response
            with self.subTest(response_type=type(response['body'])), self.assertRaisesRegex(
                    Denied, 'frontend-probe-http-response'): fixture.probe()
        fixture = Fixture(); fixture.responses[2]['body'] = b'x' * 42
        with self.assertRaisesRegex(Denied, 'frontend-probe-http-response'): fixture.probe()

    def test_markers_require_exact_independent_sha_and_newline_bytes(self):
        for marker in [(ADMIN_SHA + '\n').encode(), PUBLIC_SHA.encode(), (PUBLIC_SHA + '\r\n').encode(), b'']:
            fixture = Fixture(); fixture.responses[2]['body'] = marker
            with self.subTest(public=marker), self.assertRaises(Denied): fixture.probe()
        for marker in [(PUBLIC_SHA + '\n').encode(), ADMIN_SHA.encode(), (ADMIN_SHA + '\nextra').encode(), b'']:
            fixture = Fixture(); fixture.admin = marker
            with self.subTest(admin=marker), self.assertRaisesRegex(Denied, 'frontend-probe-admin-marker'):
                fixture.probe()

    def test_before_and_after_inspect_bind_exact_container_and_running_process(self):
        mutations = [lambda v: v.update(Id='f' * 64), lambda v: v.update(Image='sha256:' + 'f' * 64),
            lambda v: v['Config']['Labels'].update({'com.docker.compose.project': 'other'}),
            lambda v: v['Config']['Labels'].update({'com.docker.compose.service': 'api'}),
            lambda v: v['State'].update(Running=False), lambda v: v['State'].update(Restarting=True),
            lambda v: v['State'].update(OOMKilled=True), lambda v: v['State'].update(Pid=0)]
        for when in ('before', 'after'):
            for mutate in mutations:
                fixture = Fixture()
                if when == 'before': mutate(fixture.value)
                else: fixture.after = copy.deepcopy(fixture.value); mutate(fixture.after)
                with self.subTest(when=when, mutate=mutate), self.assertRaisesRegex(Denied, 'frontend-probe-container'):
                    fixture.probe()
                if when == 'before': self.assertEqual(fixture.http_calls, [])

    def test_restart_with_same_container_image_and_successful_http_is_refused(self):
        for field, value in [('Pid', 5678), ('StartedAt', '2026-11-10T00:00:01Z'), ('RestartCount', 1)]:
            fixture = Fixture(); fixture.after = copy.deepcopy(fixture.value)
            if field == 'RestartCount': fixture.after[field] = value
            else: fixture.after['State'][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(Denied, 'frontend-probe-process-changed'):
                fixture.probe()
            self.assertEqual(len(fixture.http_calls), 4)

    def test_callback_failures_have_only_finite_redacted_error_codes(self):
        def unavailable(*_args, **_kwargs): raise RuntimeError('TEST-private-provider-detail')
        for seam, code in [('inspect', 'inspect'), ('http', 'http'), ('marker', 'admin')]:
            fixture = Fixture(); setattr(fixture, seam, unavailable)
            with self.subTest(seam=seam), self.assertRaisesRegex(Denied, 'frontend-probe-' + code + '-unavailable') as caught:
                fixture.probe()
            self.assertNotIn('TEST-private-provider-detail', str(caught.exception))
            self.assertTrue(caught.exception.__suppress_context__)


if __name__ == '__main__':
    unittest.main()
