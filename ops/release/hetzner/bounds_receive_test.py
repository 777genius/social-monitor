"""The cohort stream has a hard total limit and rejects a stalled sender or EOF."""
import io
import os
import time
import unittest
from unittest.mock import patch

from bounds import receive_bytes
from contract import Denied


class ReceiveBoundsTests(unittest.TestCase):
    def test_exact_payload_and_eof_pass(self):
        read_fd, write_fd = os.pipe()
        try:
            os.write(write_fd, b'abc'); os.close(write_fd); write_fd = -1
            with os.fdopen(read_fd, 'rb') as stream:
                output = io.BytesIO()
                receive_bytes(stream, output, 3, receive_seconds=1, idle_seconds=0.1)
            self.assertEqual(output.getvalue(), b'abc')
        finally:
            if write_fd >= 0: os.close(write_fd)

    def test_stalled_sender_and_withheld_eof_expire_at_idle_limit(self):
        for payload in (b'', b'abc'):
            with self.subTest(payload=payload):
                read_fd, write_fd = os.pipe()
                try:
                    if payload: os.write(write_fd, payload)
                    with os.fdopen(read_fd, 'rb') as stream:
                        start = time.monotonic()
                        with self.assertRaisesRegex(Denied, 'receive-deadline'):
                            receive_bytes(stream, io.BytesIO(), 3, receive_seconds=2, idle_seconds=0.08)
                        self.assertLess(time.monotonic() - start, 1)
                finally:
                    os.close(write_fd)

    def test_steady_progress_can_exceed_legacy_limit_but_not_total_limit(self):
        stream = type('Stream', (), {'fileno': lambda self: 1})()
        output = io.BytesIO()
        with patch('bounds.time.monotonic', side_effect=[0, 0, 25, 25, 50, 50, 75, 75,
                                                        100, 100, 125, 125, 150, 150]), \
             patch('bounds.select.select', return_value=([1], [], [])), \
             patch('bounds.os.read', side_effect=[b'a'] * 6 + [b'']):
            receive_bytes(stream, output, 6, receive_seconds=300, idle_seconds=30)
        self.assertEqual(output.getvalue(), b'a' * 6)

        with patch('bounds.time.monotonic', side_effect=[0, 0, 4, 4, 8, 11]), \
             patch('bounds.select.select', return_value=([1], [], [])), \
             patch('bounds.os.read', side_effect=[b'a', b'b']):
            with self.assertRaisesRegex(Denied, 'receive-deadline'):
                receive_bytes(stream, io.BytesIO(), 3, receive_seconds=10, idle_seconds=5)

    def test_invalid_or_unbounded_budgets_fail_closed(self):
        for total, idle in ((0, None), (301, None), (float('inf'), None), (float('nan'), None),
                            (True, None), (120, 0), (120, 301)):
            with self.subTest(total=total, idle=idle), self.assertRaisesRegex(Denied, 'receive-deadline'):
                receive_bytes(io.BytesIO(), io.BytesIO(), 0, receive_seconds=total, idle_seconds=idle)


if __name__ == '__main__': unittest.main()
