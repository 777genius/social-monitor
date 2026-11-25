from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path


STALE_RUN_AFTER = timedelta(minutes=5)


def reconcile_stale_scweet_runs(
    db_path: str,
    now: datetime,
    *,
    stale_after: timedelta = STALE_RUN_AFTER,
) -> int:
    if db_path == ":memory:":
        return 0

    path = Path(db_path)
    if not path.exists():
        return 0

    observed_at = now.astimezone(UTC)
    cutoff = (observed_at - stale_after).timestamp()
    stats_json = json.dumps(
        {
            "tasks_failed": 1,
            "retries": 0,
            "maintenance_reason": "stale_run_reconciled",
        },
        separators=(",", ":"),
    )

    try:
        with sqlite3.connect(path, timeout=5) as connection:
            cursor = connection.execute(
                """
                UPDATE runs
                SET status = 'failed',
                    finished_at = ?,
                    stats_json = coalesce(stats_json, ?)
                WHERE status = 'running'
                  AND finished_at IS NULL
                  AND started_at < ?
                """,
                (observed_at.timestamp(), stats_json, cutoff),
            )
            return max(cursor.rowcount, 0)
    except sqlite3.Error:
        return 0
