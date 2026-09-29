from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


def load_grpc_service_without_transport_dependencies() -> ModuleType:
    """Exercise the service boundary with inert gRPC/protobuf stand-ins."""
    grpc = ModuleType("grpc")
    grpc.StatusCode = SimpleNamespace(UNAVAILABLE="UNAVAILABLE")
    timestamp = ModuleType("google.protobuf.timestamp_pb2")
    timestamp.Timestamp = type("Timestamp", (), {})
    pb2 = ModuleType("x_collector.v1.x_collector_pb2")
    pb2_grpc = ModuleType("x_collector.v1.x_collector_pb2_grpc")
    pb2_grpc.XCollectorServiceServicer = type("XCollectorServiceServicer", (), {})
    modules = {
        "grpc": grpc,
        "google": ModuleType("google"),
        "google.protobuf": ModuleType("google.protobuf"),
        "google.protobuf.timestamp_pb2": timestamp,
        "x_collector.v1.x_collector_pb2": pb2,
        "x_collector.v1.x_collector_pb2_grpc": pb2_grpc,
    }
    path = Path(__file__).resolve().parents[1] / "src/x_collector/grpc_service.py"
    spec = importlib.util.spec_from_file_location("x_collector._grpc_diagnostic_fixture", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module


class GrpcFailureDiagnosticTests(unittest.TestCase):
    def test_collector_exception_logs_class_and_stage_but_rpc_stays_generic(self) -> None:
        """The generic UNAVAILABLE path must expose no private exception detail."""
        service_module = load_grpc_service_without_transport_dependencies()
        private_detail = "synthetic-query-cookie-token"

        class FailingCollector:
            def collect_daily_search(self, _request: object) -> object:
                raise LookupError(private_detail)

        class Context:
            def abort(self, code: object, details: str) -> None:
                self.code = code
                self.details = details
                raise RuntimeError("synthetic abort")

        context = Context()
        service = service_module.XCollectorGrpcService(FailingCollector())
        with patch.object(service_module, "request_from_proto", return_value=object()):
            with self.assertLogs("x_collector._grpc_diagnostic_fixture", "ERROR") as logs:
                with self.assertRaisesRegex(RuntimeError, "synthetic abort"):
                    service.CollectDailySearch(object(), context)

        self.assertEqual(context.code, "UNAVAILABLE")
        self.assertEqual(context.details, "X collector unavailable")
        self.assertEqual(
            logs.output,
            ["ERROR:x_collector._grpc_diagnostic_fixture:"
             "X collector failure stage=collector_call error_class=LookupError"],
        )
        self.assertTrue(all(record.exc_info is None for record in logs.records))

    def test_decode_and_response_failures_have_distinct_safe_stages(self) -> None:
        """Failures around collection must identify their boundary without leaking text."""
        service_module = load_grpc_service_without_transport_dependencies()

        class Collector:
            def collect_daily_search(self, _request: object) -> object:
                return object()

        class Context:
            def abort(self, _code: object, _details: str) -> None:
                raise RuntimeError("synthetic abort")

        service = service_module.XCollectorGrpcService(Collector())
        for failing_function, stage in (
            ("request_from_proto", "request_decode"),
            ("response_to_proto", "response_encode"),
        ):
            with self.subTest(stage=stage):
                with patch.object(service_module, "request_from_proto", return_value=object()):
                    with patch.object(service_module, failing_function,
                                      side_effect=TypeError("synthetic-query-cookie-token")):
                        with self.assertLogs("x_collector._grpc_diagnostic_fixture", "ERROR") as logs:
                            with self.assertRaisesRegex(RuntimeError, "synthetic abort"):
                                service.CollectDailySearch(object(), Context())

                self.assertEqual(
                    logs.output,
                    ["ERROR:x_collector._grpc_diagnostic_fixture:"
                     f"X collector failure stage={stage} error_class=TypeError"],
                )
                self.assertTrue(all(record.exc_info is None for record in logs.records))


if __name__ == "__main__":
    unittest.main()
