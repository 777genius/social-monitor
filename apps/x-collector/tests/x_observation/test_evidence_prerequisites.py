"""Read-only utility checks on synthetic temporary evidence; no collector runtime."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from x_collector.x_observation.bounded_json import LargeJsonInteger, parse_json
from x_collector.x_observation.evidence_reader import EvidenceReader
from x_collector.x_observation.failures import ObservationFailure


class EvidencePrerequisitesTest(unittest.TestCase):
    def test_json_ambiguity_and_allocation_bounds(self):
        self.assertEqual(parse_json(b'{"a":[0,false,null]}'), {"a": [0, False, None]})
        for raw in [b'{"a":1,"a":2}', b'NaN', b'\xff', b'[' * 33 + b']' * 33, b'[01]', b'{} trailing']:
            with self.subTest(raw=raw), self.assertRaises(ObservationFailure):
                parse_json(raw)
        with self.assertRaisesRegex(ObservationFailure, "BODY_LIMIT"):
            parse_json(b'{}', max_bytes=1)
        with self.assertRaisesRegex(ObservationFailure, "SCHEMA_INVALID"):
            parse_json(b'[1,2]', max_nodes=2)
        value = parse_json(b'9' * 1001)
        self.assertIsInstance(value, LargeJsonInteger)
        self.assertEqual(value.decimal, '9' * 1001)

    def test_cancellation_and_safe_failure(self):
        def cancel():
            raise ObservationFailure('CANCELLED')
        with self.assertRaisesRegex(ObservationFailure, 'CANCELLED'):
            parse_json(b'{}', check=cancel)
        failure = ObservationFailure('JOURNAL_FAILURE', sequence=0)
        self.assertEqual(str(failure), 'JOURNAL_FAILURE')
        self.assertEqual(failure.semantic(), dict(code='JOURNAL_FAILURE', stage='HOME', effects='NONE', retryable=False, sequence=0))

    def test_read_only_exact_bytes_and_inode_replacement(self):
        with tempfile.TemporaryDirectory(prefix='sm-e3-evidence-', dir='.cache/handoff') as folder:
            root = Path(folder)
            record = root / 'record.json'
            record.write_bytes(b'{ "value": 0 }\n')
            record.chmod(0o400)
            before = record.stat()
            real_open = os.open
            def readonly(path, flags, *args, **kwargs):
                self.assertFalse(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC))
                return real_open(path, flags, *args, **kwargs)
            with patch('os.open', side_effect=readonly), patch('os.write', side_effect=AssertionError('write')), patch('os.fsync', side_effect=AssertionError('fsync')):
                with EvidenceReader(root, os.getuid(), {'record': record.name}, immutable=True) as reader:
                    self.assertEqual(reader.read_bytes('record'), b'{ "value": 0 }\n')
                    self.assertEqual(reader.read('record'), {'value': 0})
                    self.assertEqual(record.stat().st_ino, before.st_ino)
                    self.assertEqual(record.stat().st_mtime_ns, before.st_mtime_ns)
                    replacement = root / 'replacement'
                    replacement.write_bytes(record.read_bytes())
                    replacement.chmod(0o400)
                    replacement.replace(record)
                    with self.assertRaisesRegex(ObservationFailure, 'JOURNAL_FAILURE'):
                        reader.read('record')

    def test_rejects_untrusted_names_modes_links_and_nonregular_files(self):
        with tempfile.TemporaryDirectory(prefix='sm-e3-evidence-', dir='.cache/handoff') as folder:
            root = Path(folder)
            with self.assertRaisesRegex(ObservationFailure, 'INVALID_GRANT'):
                EvidenceReader(root, os.getuid(), {'bad': '../escape'})
            record = root / 'record'
            record.write_bytes(b'{}')
            record.chmod(0o400)
            with EvidenceReader(root, os.getuid(), {'r': 'record'}, immutable=True) as reader:
                with self.assertRaises(ObservationFailure):
                    reader.read('unknown')
                record.chmod(0o644)
                with self.assertRaises(ObservationFailure):
                    reader.read('r')
                record.chmod(0o400)
                os.link(record, root / 'hardlink')
                with self.assertRaises(ObservationFailure):
                    reader.read('r')
                (root / 'hardlink').unlink()
                record.unlink()
                record.symlink_to(root / 'absent')
                with self.assertRaises(ObservationFailure):
                    reader.read('r')
                record.unlink()
                os.mkfifo(record, 0o400)
                with self.assertRaises(ObservationFailure):
                    reader.read('r')
            with self.assertRaises(ObservationFailure):
                reader.read('r')


if __name__ == '__main__':
    unittest.main()
