"""Synthetic, offline concurrency coverage for graceful collector shutdown."""
import importlib.util
from pathlib import Path
import threading
import time
import unittest

import grpc
spec = importlib.util.spec_from_file_location('rpc_drain_candidate', Path(__file__).parents[1] / 'src/x_collector/rpc_drain.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class Aborted(Exception): pass
class Context:
    def add_callback(self, callback): self.callback = callback; return True
    def finish(self): self.callback()
    def abort(self, code, message):
        raise Aborted((code, message))

class DrainTests(unittest.TestCase):
    def test_waits_for_two_handlers_even_after_client_deadline(self):
        drain = module.RpcDrain(); release = threading.Event()
        entered = [threading.Event(), threading.Event()]; client_expired = threading.Event()
        def handler(index):
            context = Context()
            with drain.call(context):
                entered[index].set(); release.wait(3)
            context.finish()
        workers = [threading.Thread(target=handler, args=(i,)) for i in range(2)]
        for worker in workers: worker.start()
        for flag in entered: self.assertTrue(flag.wait(1))
        completed = threading.Event()
        stopping = threading.Thread(target=lambda: (drain.close_and_wait(), completed.set()))
        stopping.start()
        # Simulate client deadline: it does not imply the Python handler returned.
        client_expired.set(); self.assertTrue(client_expired.is_set())
        self.assertFalse(completed.wait(.05))
        release.set()
        for worker in workers: worker.join(2); self.assertFalse(worker.is_alive())
        stopping.join(2); self.assertTrue(completed.is_set())
        with self.assertRaises(Aborted):
            with drain.call(Context()): self.fail('accepted after shutdown')

    def test_exception_runs_finally(self):
        drain = module.RpcDrain()
        context = Context()
        with self.assertRaisesRegex(RuntimeError, 'handler'):
            with drain.call(context): raise RuntimeError('handler')
        context.finish()
        drain.close_and_wait()

    def test_waits_for_transport_after_python_handler_returns(self):
        drain = module.RpcDrain(); context = Context(); done = threading.Event()
        with drain.call(context): pass
        stop = threading.Thread(target=lambda: (drain.close_and_wait(), done.set())); stop.start()
        self.assertFalse(done.wait(.05))
        context.finish(); stop.join(2); self.assertTrue(done.is_set())

    def test_shutdown_races_entry_without_losing_active_work(self):
        for _ in range(100):
            drain = module.RpcDrain(); barrier = threading.Barrier(2); release = threading.Event(); entered = threading.Event()
            done = threading.Event()
            def handler():
                barrier.wait()
                context = Context()
                try:
                    with drain.call(context): entered.set(); release.wait(2)
                except Aborted: pass
                else: context.finish()
            worker = threading.Thread(target=handler); worker.start(); barrier.wait()
            stop = threading.Thread(target=lambda: (drain.close_and_wait(), done.set())); stop.start()
            if entered.wait(.005): self.assertFalse(done.is_set())
            release.set(); worker.join(2); stop.join(2)
            self.assertFalse(worker.is_alive()); self.assertTrue(done.is_set())

if __name__ == '__main__': unittest.main()
