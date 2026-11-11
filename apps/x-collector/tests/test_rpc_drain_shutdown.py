"""Exercise the actual signal function without starting external services."""
import ast
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
import threading
import types
import unittest

import grpc  # Project dependency, not a live request.
root = Path(__file__).parents[1] / 'src/x_collector'
spec = importlib.util.spec_from_file_location('rpc_drain_shutdown', root / 'rpc_drain.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
tree = ast.parse((root / 'server.py').read_text())
main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
function = next(n for n in main.body if isinstance(n, ast.FunctionDef) and n.name == 'stop')
code = compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), '<signal>', 'exec')

class ShutdownTest(unittest.TestCase):
    def test_real_nested_sigterm_before_ignore_produces_one_marker(self):
        script = r"""
import ast,json,logging,os,signal,threading,time
from pathlib import Path
root=Path(os.environ['CANDIDATE_SERVER'])
tree=ast.parse(root.read_text())
main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
stop=next(n for n in main.body if isinstance(n,ast.FunctionDef) and n.name=='stop')
code=compile(ast.fix_missing_locations(ast.Module(body=[stop],type_ignores=[])),str(root),'exec')
class Drain:
 def close_and_wait(self): pass
class Server:
 def stop(self,grace): return self
 def wait(self): pass
once=threading.Lock()
real_signal=signal.signal
class Signal:
 SIGTERM=signal.SIGTERM; SIGINT=signal.SIGINT; SIG_IGN=signal.SIG_IGN
 def __init__(self): self.once=False
 def signal(self,sig,handler):
  if not self.once:
   self.once=True
   os.kill(os.getpid(), signal.SIGTERM)
  return real_signal(sig,handler)
namespace={'shutdown_once':once,'signal':Signal(),'drain':Drain(),'server':Server(),
           'logging':logging,'os':os,'time':time,'json':json}
exec(code,namespace)
real_signal(signal.SIGTERM,namespace['stop'])
os.kill(os.getpid(), signal.SIGTERM)
"""
        env=dict(os.environ,CANDIDATE_SERVER=str(root / 'server.py'))
        result=subprocess.run([sys.executable,'-c',script],env=env,capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stderr)
        markers=[json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(len(markers),1)
        self.assertEqual(markers[0]['marker'],'social-monitor-x-handlers-drained-v1')

    def test_marker_only_after_handler_and_grpc_are_finished(self):
        drain=module.RpcDrain(); started=threading.Event(); release=threading.Event(); events=[]
        class Context:
            def add_callback(self, callback): self.callback = callback; return True
            def abort(self, *_): raise RuntimeError('aborted')
        def handler():
            context = Context()
            with drain.call(context): started.set(); release.wait(3)
            context.callback()
        active=threading.Thread(target=handler); active.start(); self.assertTrue(started.wait(1))
        class Server:
            def stop(self, grace):
                self.assertion(grace is None); events.append('stop'); return self
            def assertion(self, value):
                if not value: raise AssertionError('unexpected grace')
            def wait(self): events.append('stopped')
        signals=types.SimpleNamespace(SIGTERM=15, SIGINT=2, SIG_IGN=0, signal=lambda *args: None)
        logs=types.SimpleNamespace(getLogger=lambda _: types.SimpleNamespace(info=lambda *_: None))
        clock=types.SimpleNamespace(time_ns=lambda: 123_000_000)
        namespace={'shutdown_once':threading.Lock(),'drain':drain,'server':Server(),'signal':signals,'logging':logs,
                   'os':types.SimpleNamespace(getpid=lambda:1),'time':clock,'json':json,
                   'print':lambda value, **_: events.append(json.loads(value))}
        exec(code,namespace)
        shutdown=threading.Thread(target=namespace['stop'],args=(15,None)); shutdown.start()
        self.assertTrue(shutdown.is_alive()); self.assertEqual(events,[])
        release.set(); active.join(2); shutdown.join(2)
        self.assertFalse(shutdown.is_alive()); self.assertEqual(events[:2],['stop','stopped'])
        self.assertEqual(events[2],{'marker':'social-monitor-x-handlers-drained-v1',
                                    'signal':'SIGTERM','pid':1,'completed_at_ms':123})

if __name__ == '__main__': unittest.main()
