"""No network: enforce fixed hosts, bounded process output and no redirects/proxies."""
import unittest
from contract import Denied
from frontend_http import http_get


class Runner:
    def __init__(self, raw=b'ok\n200'):
        self.raw, self.calls = raw, []

    def run(self, argv, limit):
        self.calls.append((argv, limit))
        return self.raw


class FrontendHttpTests(unittest.TestCase):
    def call(self, url, raw=b'ok\n200', **options):
        runner = Runner(raw)
        args = {'timeout_seconds': 5, 'max_bytes': 100, 'follow_redirects': False, 'use_proxy': False}
        args.update(options)
        result = http_get(url, runner=runner, **args)
        return result, runner

    def test_fixed_urls_use_bounded_direct_curl(self):
        sha = 'a' * 40
        for url in ('https://social-monitor.app/', 'https://social-monitor.app/favicon.svg',
                    'https://social-monitor.app/release-sha.txt?release=' + sha,
                    'https://admin.social-monitor.app/'):
            result, runner = self.call(url)
            self.assertEqual(result, {'status': 200, 'body': b'ok'})
            command, limit = runner.calls[0]
            self.assertEqual(limit, 104)
            self.assertEqual(command[-2:], ['--', url])
            self.assertEqual(command[1], '-q')
            self.assertIn('--noproxy', command)
            self.assertIn('--max-time', command)
            self.assertNotIn('--location', command)

    def test_redirect_not_followed_and_bad_or_oversize_response_denied(self):
        result, runner = self.call('https://social-monitor.app/', b'redirect\n302')
        self.assertEqual(result['status'], 302)
        self.assertEqual(len(runner.calls), 1)
        for raw in (b'x' * 101 + b'\n200', b'bad', b'content\nxyz'):
            with self.subTest(raw=raw), self.assertRaises(Denied):
                self.call('https://social-monitor.app/', raw)

    def test_untrusted_hosts_paths_options_and_proxy_are_denied(self):
        for url in ('http://social-monitor.app/', 'https://social-monitor.app.evil/',
                    'https://admin.social-monitor.app/release-sha.txt',
                    'https://social-monitor.app/release-sha.txt?release=wrong',
                    'https://user@social-monitor.app/', 'https://social-monitor.app/#fragment',
                    'https://social-monitor.app/favicon.svg\n', 'https://social-monitor.app/?'):
            with self.subTest(url=url), self.assertRaises(Denied): self.call(url)
        for options in ({'timeout_seconds': 6}, {'max_bytes': 262145}, {'use_proxy': True}, {'follow_redirects': True}):
            with self.subTest(options=options), self.assertRaises(Denied):
                self.call('https://social-monitor.app/', **options)


if __name__ == '__main__':
    unittest.main()
