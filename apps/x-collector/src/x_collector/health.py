from __future__ import annotations

import logging
from datetime import UTC, datetime
from threading import Lock

from .domain import XCollectorWarning


class XCollectorHealthMonitor:
    def __init__(self) -> None:
        self._lock = Lock()
        self._manifest_failures = 0
        self._last_manifest_failure_at: datetime | None = None

    def record_manifest_scrape_failed(self) -> None:
        with self._lock:
            self._manifest_failures += 1
            self._last_manifest_failure_at = datetime.now(UTC)

    def clear_manifest_scrape_failed(self) -> None:
        with self._lock:
            self._manifest_failures = 0
            self._last_manifest_failure_at = None

    def warnings(self) -> tuple[XCollectorWarning, ...]:
        with self._lock:
            if self._manifest_failures == 0:
                return ()

            observed_at = (
                self._last_manifest_failure_at.isoformat()
                if self._last_manifest_failure_at is not None
                else "unknown"
            )
            return (
                XCollectorWarning(
                    code="x_collector.manifest_scrape_failed",
                    message=(
                        "Scweet live manifest scrape failed; collector is using "
                        "cached or bundled manifest data. Watch for X private API "
                        f"drift. failures={self._manifest_failures} "
                        f"lastObservedAt={observed_at}"
                    ),
                ),
            )


class ScweetManifestHealthLogHandler(logging.Handler):
    def __init__(self, monitor: XCollectorHealthMonitor) -> None:
        super().__init__(level=logging.INFO)
        self._monitor = monitor

    def emit(self, record: logging.LogRecord) -> None:
        message = record.getMessage()

        if "Live manifest scrape failed" in message:
            self._monitor.record_manifest_scrape_failed()
            return

        if (
            "Live manifest scraped successfully" in message
            or "Using cached live manifest" in message
        ):
            self._monitor.clear_manifest_scrape_failed()


def install_scweet_manifest_health_monitor(
    monitor: XCollectorHealthMonitor,
) -> None:
    for logger_name in ("Scweet.client", "Scweet.manifest"):
        logger = logging.getLogger(logger_name)
        logger.handlers = [
            handler
            for handler in logger.handlers
            if not isinstance(handler, ScweetManifestHealthLogHandler)
        ]
        logger.addHandler(ScweetManifestHealthLogHandler(monitor))
