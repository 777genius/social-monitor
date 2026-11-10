import json
import unittest

from host import Host


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


if __name__ == '__main__':
    unittest.main()
