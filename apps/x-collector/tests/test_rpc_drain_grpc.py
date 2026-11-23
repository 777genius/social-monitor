"""Real local gRPC deadlines; fake handlers only, no external calls."""
from concurrent import futures
import importlib.util
from pathlib import Path
import threading
import time
import unittest

import grpc
spec = importlib.util.spec_from_file_location('rpc_drain_grpc', Path(__file__).parents[1] / 'src/x_collector/rpc_drain.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class GrpcDrainTest(unittest.TestCase):
    def test_inflight_response_completes_before_shutdown(self):
        drain = module.RpcDrain(); entered = threading.Event(); release = threading.Event(); closed = threading.Event()
        def handler(request, context):
            with drain.call(context):
                entered.set(); release.wait(3); return b'complete'
        pool = futures.ThreadPoolExecutor(max_workers=4); server = grpc.server(pool)
        server.add_generic_rpc_handlers((grpc.method_handlers_generic_handler('synthetic.Test', {
            'Call': grpc.unary_unary_rpc_method_handler(handler)}),))
        port=server.add_insecure_port('127.0.0.1:0'); server.start()
        channel=grpc.insecure_channel(f'127.0.0.1:{port}')
        try:
            response=channel.unary_unary('/synthetic.Test/Call').future(b'', timeout=2)
            self.assertTrue(entered.wait(1))
            thread=threading.Thread(target=lambda: (drain.close_and_wait(), closed.set())); thread.start()
            self.assertFalse(closed.wait(.05)); release.set()
            self.assertEqual(response.result(timeout=1), b'complete')
            thread.join(2); self.assertTrue(closed.is_set())
        finally:
            release.set(); server.stop(None).wait(); channel.close(); pool.shutdown(wait=True)

    def test_expired_client_does_not_release_running_python_handler(self):
        drain = module.RpcDrain(); entered = threading.Event(); release = threading.Event(); closed = threading.Event()
        def handler(request, context):
            with drain.call(context):
                entered.set(); release.wait(3); return b'ok'
        pool = futures.ThreadPoolExecutor(max_workers=4)
        server = grpc.server(pool)
        server.add_generic_rpc_handlers((grpc.method_handlers_generic_handler('synthetic.Test', {
            'Call': grpc.unary_unary_rpc_method_handler(handler)}),))
        port = server.add_insecure_port('127.0.0.1:0'); server.start()
        channel = grpc.insecure_channel(f'127.0.0.1:{port}')
        call = channel.unary_unary('/synthetic.Test/Call')
        try:
            future = call.future(b'', timeout=.1)
            self.assertTrue(entered.wait(1))
            with self.assertRaises(grpc.RpcError) as failure:
                future.result(timeout=1)
            self.assertEqual(failure.exception.code(), grpc.StatusCode.DEADLINE_EXCEEDED)
            thread = threading.Thread(target=lambda: (drain.close_and_wait(), closed.set())); thread.start()
            time.sleep(.05); self.assertFalse(closed.is_set())
            with self.assertRaises(grpc.RpcError) as refused: call(b'', timeout=1)
            self.assertEqual(refused.exception.code(), grpc.StatusCode.UNAVAILABLE)
            release.set(); thread.join(2); self.assertTrue(closed.is_set())
        finally:
            release.set(); server.stop(None).wait(); channel.close(); pool.shutdown(wait=True)

if __name__ == '__main__': unittest.main()
