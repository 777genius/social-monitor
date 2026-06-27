from __future__ import annotations

import logging
import signal
from concurrent import futures

import grpc

from x_collector.v1 import x_collector_pb2_grpc

from .config import XCollectorSettings
from .grpc_service import XCollectorGrpcService
from .scweet_adapter import ScweetDailySearchCollector


def create_server(settings: XCollectorSettings) -> grpc.Server:
    collector = ScweetDailySearchCollector.from_settings(settings)
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=settings.max_workers),
    )
    x_collector_pb2_grpc.add_XCollectorServiceServicer_to_server(
        XCollectorGrpcService(
            collector,
            service_token=settings.service_token,
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

