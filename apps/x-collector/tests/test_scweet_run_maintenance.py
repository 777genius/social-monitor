from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta

from x_collector.scweet_run_maintenance import reconcile_stale_scweet_runs


def test_reconciles_only_stale_running_rows(tmp_path) -> None:
    db_path = tmp_path / "scweet_state.db"
    now = datetime(2026, 7, 13, 12, tzinfo=UTC)

    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE runs (
              run_id TEXT PRIMARY KEY,
              status TEXT NOT NULL,
              started_at REAL NOT NULL,
              finished_at REAL,
              stats_json TEXT
            )
            """
        )
        connection.executemany(
            "INSERT INTO runs VALUES (?, ?, ?, ?, ?)",
            (
                (
                    "stale",
                    "running",
                    (now - timedelta(minutes=6)).timestamp(),
                    None,
                    None,
                ),
                (
                    "active",
                    "running",
                    (now - timedelta(minutes=4)).timestamp(),
                    None,
                    None,
                ),
                (
                    "completed",
                    "completed",
                    (now - timedelta(hours=1)).timestamp(),
                    (now - timedelta(minutes=59)).timestamp(),
                    "{}",
                ),
            ),
        )

    assert reconcile_stale_scweet_runs(str(db_path), now) == 1

    with sqlite3.connect(db_path) as connection:
        rows = {
            row[0]: row[1:]
            for row in connection.execute(
                "SELECT run_id, status, finished_at, stats_json FROM runs"
            )
        }

    stale = rows["stale"]
    assert stale[0] == "failed"
    assert stale[1] == now.timestamp()
    assert json.loads(stale[2])["maintenance_reason"] == "stale_run_reconciled"
    assert rows["active"][0] == "running"
    assert rows["active"][1] is None
    assert rows["completed"][0] == "completed"
