"""All-history and separately bound PG18 observer contract fixtures."""
import copy
import unittest
import time
from test_support import history_context
from prisma_history import utc
from contract import Denied, canonical
import evidence
from operator_adapter import dispatch
from operator_config import decode, SYSTEM_ID
import operator_database as database
from operator_adapter_test import BINDING, FixtureConfig, FixtureRunner
from operator_backup_test import identity_row

ROW = {'id': '00000000-0000-0000-0000-000000000001', 'applied_steps_count': 0, 'name': '20261002000000_fixture', 'checksum': 'a' * 64,
       'started_at': '2026-10-02 00:00:00+00', 'finished_at': '2026-10-02 00:00:01+00',
       'rolled_back_at': None}


class DatabaseTests(unittest.TestCase):
    # Red: the old adapter marks a rolled predecessor failed and its success duplicate.
    def test_resolved_retry_is_admitted_without_losing_attempts(self):
        value = identity_row()
        value['migrations'] = [
            {**ROW, 'id': '00000000-0000-0000-0000-000000000001', 'applied_steps_count': 0,
             'finished_at': None, 'rolled_back_at': '2026-10-02 00:00:01+00'},
            {**ROW, 'id': '00000000-0000-0000-0000-000000000002', 'applied_steps_count': 0,
             'started_at': '2026-10-02 00:00:02+00', 'finished_at': '2026-10-02 00:00:03+00'}]
        result = {**database.database(FixtureConfig(), self.observer(value)), 'observed_at': int(time.time())}
        self.assertEqual(result['failed_migrations'], [])
        evidence.database(result, [{'name': ROW['name'], 'checksum': ROW['checksum']}])
        self.assertEqual(len(result['history']['rows']), 2)
        self.assertEqual(result['history']['rows'][0]['rolled_back_at'], utc(value['migrations'][0]['rolled_back_at']))
        self.assertEqual(result['history']['rows'][1]['id'], value['migrations'][1]['id'])

    def observer(self, value, config=None):
        def provider(argv, data, env):
            self.assertEqual(argv[0], '/usr/lib/postgresql/18/bin/psql')
            self.assertIn('--dbname=service=observer', argv)
            self.assertIn('--no-password', argv)
            self.assertNotIn('PGPASSWORD', env)
            self.assertIn(b'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY', data)
            self.assertIn(b'ROLLBACK', data)
            result = copy.deepcopy(value)
            if result['migrations'] is not None and result['history_complete'] is None:
                result['history_complete'] = True
            if result['migrations'] is not None and result['history_context'] is None:
                result['history_context'] = history_context(result['migrations'],
                    result['system_identifier'], result['database'], result['role'], result['port'])
            return result
        return FixtureRunner(provider)

    def test_database_and_independent_identity_share_exact_pg_service(self):
        config = FixtureConfig()
        value = identity_row(); value['migrations'] = [copy.deepcopy(ROW)]
        result = decode(dispatch('database', BINDING, config, self.observer(value)))
        self.assertEqual(result['system_identifier'], SYSTEM_ID)
        self.assertEqual(result['failed_migrations'], [])
        self.assertEqual(result['sha'], BINDING['sha'])
        evidence.database(result, [{'name': ROW['name'], 'checksum': ROW['checksum']}])
        result = decode(dispatch('postgres-identity', {}, config, self.observer(identity_row())))
        self.assertEqual(result['system_identifier'], SYSTEM_ID)
        self.assertIs(type(result['system_identifier']), str)
        self.assertEqual(result['method'], 'pg_control_system')

    def test_failed_pending_rolled_and_duplicate_history_are_not_hidden(self):
        for changes in ({'finished_at': None},
                        {'finished_at': None, 'rolled_back_at': '2026-10-02 00:00:02+00'}):
            value = identity_row()
            value['migrations'] = [copy.deepcopy(ROW),
                {**ROW, 'id': '00000000-0000-0000-0000-000000000002',
                 'name': '20261002000001_failed', **changes}]
            result = {**database.database(FixtureConfig(), self.observer(value)), 'observed_at': int(time.time())}
            self.assertEqual(len(result['failed_migrations']), 1)
            self.assertEqual(len(result['applied_migrations']), 1)
            with self.assertRaises(Denied):
                evidence.database(result, [{'name': ROW['name'], 'checksum': ROW['checksum']}])
        for changes in ({'started_at': None}, {'rolled_back_at': '2026-10-02 00:00:02+00'}):
            value = identity_row(); value['migrations'] = [{**ROW, **changes}]
            with self.assertRaises(Denied): database.database(FixtureConfig(), self.observer(value))
        value = identity_row(); value['migrations'] = [copy.deepcopy(ROW), copy.deepcopy(ROW)]
        with self.assertRaises(Denied): database.database(FixtureConfig(), self.observer(value))

    def test_filtered_history_or_replaced_migration_relation_deny(self):
        value = identity_row()
        value.update({'migrations': [copy.deepcopy(ROW)], 'history_complete': False})
        with self.assertRaises(Denied):
            database.database(FixtureConfig(), self.observer(value))

    def test_wrong_database_role_version_cluster_and_unrestricted_tx_deny(self):
        for changes in ({'database': 'other'}, {'role': 'postgres'}, {'server_major': 17},
                        {'system_identifier': str(int(SYSTEM_ID) + 1)},
                        {'system_identifier': int(SYSTEM_ID)}, {'transaction_read_only': False},
                        {'read_only_role': False}, {'port': '5433'}, {'server_major': True}):
            value = {**identity_row(), **changes}
            with self.assertRaises(Denied): database.identity(FixtureConfig(), self.observer(value))

    def test_malformed_rows_and_exact_sql_checksum_binding(self):
        for changes in ({'checksum': 'not-sha256'}, {'finished_at': True}, {'finished_at': '2026-99-99 00:00:00+00'},
                        {'finished_at': '2026-10-01 00:00:00+00'}, {'name': '../../candidate'}):
            value = identity_row(); value['migrations'] = [{**ROW, **changes}]
            with self.assertRaises(Denied): database.database(FixtureConfig(), self.observer(value))
        value = identity_row(); value['migrations'] = [copy.deepcopy(ROW)]
        result = {**database.database(FixtureConfig(), self.observer(value)), 'observed_at': int(time.time())}
        with self.assertRaises(Denied):
            evidence.database(result, [{'name': ROW['name'], 'checksum': 'b' * 64}])


if __name__ == '__main__':
    unittest.main()
