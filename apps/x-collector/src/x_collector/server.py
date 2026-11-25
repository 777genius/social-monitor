from __future__ import annotations

import json
import logging
import os
import signal
import time
from concurrent import futures
from threading import Lock

import grpc

from x_collector.v1 import x_collector_pb2_grpc

from .config import XCollectorSettings
from .grpc_service import XCollectorGrpcService
from .health import (
    XCollectorHealthMonitor,
    install_scweet_manifest_health_monitor,
)
from .reloading_scweet_collector import ReloadingScweetDailySearchCollector
from .rpc_drain import RpcDrain


def create_server(settings: XCollectorSettings, drain: RpcDrain | None = None) -> grpc.Server:
    health_monitor = XCollectorHealthMonitor()
    install_scweet_manifest_health_monitor(health_monitor)
    collector = ReloadingScweetDailySearchCollector(settings)
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=settings.max_workers),
    )
    x_collector_pb2_grpc.add_XCollectorServiceServicer_to_server(
        XCollectorGrpcService(
            collector,
            service_token=settings.service_token,
            health_monitor=health_monitor,
            drain=drain,
        ),
        server,
    )
    server.add_insecure_port(settings.grpc_bind)
    return server


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings = XCollectorSettings.from_env()
    drain = RpcDrain()
    server = create_server(settings, drain)
    server.start()
    logging.getLogger(__name__).info("x-collector listening on gRPC")

    shutdown_once = Lock()

    def stop(signum: int, _frame: object) -> None:
        # Keep the lock permanently: a nested signal may arrive even before
        # the first handler has installed SIG_IGN.
        if not shutdown_once.acquire(blocking=False):
            return
        # Subsequent signals must not re-enter the wait and stop the server early.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        logging.getLogger(__name__).info("x-collector draining")
        drain.close_and_wait()
        # No collector handler or tracked RPC remains. gRPC rejects queued calls and the
        # event completes only when its remaining handlers have terminated.
        server.stop(grace=None).wait()
        if signum == signal.SIGTERM:
            print(json.dumps({"marker": "social-monitor-x-handlers-drained-v1",
                "signal": "SIGTERM", "pid": os.getpid(),
                "completed_at_ms": time.time_ns() // 1_000_000}), flush=True)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    server.wait_for_termination()
