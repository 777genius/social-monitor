import json
import unittest

from host import Host
from backend_host import BackendHost
from worker_host import SERVICE
from contract import Denied


class ListingHost(Host):
    def __init__(self, listings):
        super().__init__({'project': 'test-project', 'required_non_targets': {'worker': 'worker'},
                          'fenced_units': []})
        self.listings = listings
        self.inspected = []

    def docker(self, *args):
        if args[0] == 'ps':
            return '\n'.join(json.dumps(row) for row in self.listings).encode()
        ident = args[-1]
        self.inspected.append(ident)
        assert ident != 'vanished'
        return json.dumps({'id': ident, 'service': ident, 'project': 'test-project',
                           'image': 'fixture', 'started': 'fixture', 'running': True}).encode()


def row(ident, service, oneoff):
    return {'id': ident, 'project': 'test-project', 'service': service, 'oneoff': oneoff}


class CollectionSnapshotTests(unittest.TestCase):
    def test_disappearing_collection_is_not_inspected(self):
        host = ListingHost([row('api', 'api', 'False'), row('vanished', 'collection', 'True')])
        snapshot, target = host.snapshot()
        self.assertEqual(target['id'], 'api')
        self.assertEqual(set(snapshot['containers']), {'worker'})
        self.assertNotIn('vanished', host.inspected)

    def test_normal_collection_remains_protected(self):
        host = ListingHost([row('api', 'api', 'False'), row('collection', 'collection', 'False')])
        snapshot, _ = host.snapshot()
        self.assertIn('collection', snapshot['containers'])

    def test_missing_oneoff_or_other_project_is_not_skipped(self):
        missing = row('collection', 'collection', '')
        other = row('collection2', 'collection', 'True')
        other['project'] = 'other'
        host = ListingHost([row('api', 'api', 'False'), missing, other])
        snapshot, _ = host.snapshot()
        self.assertEqual(set(snapshot['containers']), {'worker', 'collection', 'collection2'})

    def test_other_disappeared_container_fails(self):
        host = ListingHost([row('api', 'api', 'False'), row('vanished', 'worker', 'False')])
        with self.assertRaises(AssertionError):
            host.snapshot()

    def test_required_selector_is_never_skipped(self):
        host = ListingHost([row('api', 'api', 'False'), row('worker', 'collection', 'True')])
        snapshot, _ = host.snapshot()
        self.assertIn('worker', snapshot['containers'])


class CohortSnapshotTests(unittest.TestCase):
    def fixture(self, extra=False):
        host = ListingHost([row('a' * 64, 'api', 'False'), row('b' * 64, SERVICE, 'False')])
        host.c['required_non_targets'] = {SERVICE: 'worker-name'}
        if extra:
            host.listings.append(row('c' * 64, SERVICE, 'False'))
        def docker(*args):
            if args[0] == 'ps':
                return '\n'.join(json.dumps(value) for value in host.listings).encode()
            ident = args[-1]
            host.inspected.append(ident)
            actual = 'b' * 64 if ident == 'worker-name' else ident
            service = 'api' if actual == 'a' * 64 else SERVICE
            return json.dumps({'id': actual, 'service': service, 'project': 'test-project',
                               'image': 'fixture', 'started': 'fixture', 'running': True}).encode()
        host.docker = docker
        return host

    def test_named_selector_and_listing_same_id_deduplicated_after_selector_check(self):
        host = self.fixture()
        snapshot, targets = BackendHost(host, None).snapshot()
        self.assertEqual(set(targets), {'api', SERVICE})
        self.assertEqual(snapshot['containers'], {})
        self.assertIn('worker-name', host.inspected)
        self.assertIn('b' * 64, host.inspected)

    def test_missing_worker_name_permitted_only_for_declared_target_during_recreation(self):
        host = self.fixture()
        host.listings = [row('a' * 64, 'api', 'False')]
        original = host.docker
        def missing(*args):
            if args[0] == 'ps' and any(value.startswith('name=') for value in args):
                return b''
            if args[-1] == 'worker-name':
                raise AssertionError('missing name was inspected')
            return original(*args)
        host.docker = missing
        snapshot, targets = BackendHost(host, None).snapshot(complete=False)
        self.assertEqual(set(targets), {'api'})
        with self.assertRaises(AssertionError): BackendHost(host, None).snapshot()
        host.c['required_non_targets']['agent-runtime'] = 'protected-missing'
        def protected(*args):
            if args[-1] == 'protected-missing':
                raise AssertionError('protected still enforced')
            return missing(*args)
        host.docker = protected
        with self.assertRaisesRegex(AssertionError, 'protected still enforced'):
            BackendHost(host, None).snapshot(complete=False)

    def test_two_distinct_worker_ids_still_rejected(self):
        with self.assertRaisesRegex(Denied, 'backend-target-count'):
            BackendHost(self.fixture(extra=True), None).snapshot()


if __name__ == '__main__':
    unittest.main()
