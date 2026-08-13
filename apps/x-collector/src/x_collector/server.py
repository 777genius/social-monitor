from __future__ import annotations

import logging
import signal
from concurrent import futures

import grpc

from x_collector.v1 import x_collector_pb2_grpc

from .config import XCollectorSettings
from .grpc_service import XCollectorGrpcService
from .health import (
    XCollectorHealthMonitor,
    install_scweet_manifest_health_monitor,
)
from .reloading_scweet_collector import ReloadingScweetDailySearchCollector


def create_server(settings: XCollectorSettings) -> grpc.Server:
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
    server = create_server(settings)
    server.start()
    logging.getLogger(__name__).info("x-collector listening on gRPC")

    def stop(*_: object) -> None:
        logging.getLogger(__name__).info("x-collector shutting down")
        server.stop(grace=10)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    server.wait_for_termination()
