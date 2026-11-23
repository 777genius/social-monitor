"""Drain Python handlers and their RPCs without cancelling in-flight work."""
from contextlib import contextmanager
from threading import Condition

import grpc


class RpcDrain:
    def __init__(self):
        self._condition = Condition()
        self._draining = False
        self._active = 0
        self._pending = 0

    def _rpc_finished(self):
        with self._condition:
            self._pending -= 1
            self._condition.notify_all()

    @contextmanager
    def call(self, context):
        with self._condition:
            accepted = not self._draining
            if accepted:
                self._active += 1
                self._pending += 1
        if not accepted:
            context.abort(grpc.StatusCode.UNAVAILABLE, "X collector is draining")
            return
        try:
            try:
                registered = context.add_callback(self._rpc_finished)
            except BaseException:
                self._rpc_finished()
                raise
            if not registered:
                self._rpc_finished()
            yield
        finally:
            with self._condition:
                self._active -= 1
                self._condition.notify_all()

    def close_and_wait(self):
        with self._condition:
            self._draining = True
            self._condition.wait_for(lambda: self._active == 0 and self._pending == 0)
