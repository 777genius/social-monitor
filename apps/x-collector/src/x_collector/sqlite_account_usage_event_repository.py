from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .account_usage import AccountUsageEvent


class SqliteAccountUsageEventRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def append_events(self, events: tuple[AccountUsageEvent, ...]) -> None:
        if not events or self._db_path == ":memory:":
            return

        Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._db_path, timeout=30.0) as connection:
            ensure_account_usage_events_schema(connection)
            for index_schema in account_usage_events_index_schemas():
                connection.execute(index_schema)
            connection.executemany(
                """
                INSERT INTO account_usage_events (
                  event_id,
                  event_type,
                  provider,
                  occurred_at,
                  account_id,
                  username,
                  request_id,
                  scan_job_id,
                  collector_run_id,
                  source_binding_id,
                  query,
                  pass_observation_id,
                  observation_relation,
                  pass_label,
                  product,
                  estimated_request_cost,
                  daily_requests_limit,
                  daily_tweets_limit,
                  account_priority,
                  requests_before,
                  requests_after,
                  tweets_before,
                  tweets_after,
                  fetched_count,
                  accepted_count,
                  returned_count,
                  failure_kind,
                  cooldown_reason,
                  reset_at,
                  attribution_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [event_to_row(event) for event in events],
            )


def ensure_account_usage_events_schema(connection: sqlite3.Connection) -> None:
    # Serialize the read-then-migrate sequence. Without an immediate write
    # lock, concurrent first writers can both observe a missing column and
    # race the same ALTER TABLE statement.
    if not connection.in_transaction:
        connection.execute("BEGIN IMMEDIATE")
    connection.execute(account_usage_events_schema())
    columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(account_usage_events)")
    }
    for column, definition in {
        "daily_requests_limit": "INTEGER",
        "daily_tweets_limit": "INTEGER",
        "account_priority": "INTEGER",
        "attribution_status": "TEXT",
        "pass_observation_id": "TEXT",
        "observation_relation": "TEXT",
        "collector_run_id": "TEXT",
    }.items():
        if column not in columns:
            connection.execute(
                f"ALTER TABLE account_usage_events ADD COLUMN {column} {definition}",
            )


def account_usage_events_schema() -> str:
    return """
    CREATE TABLE IF NOT EXISTS account_usage_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      account_id INTEGER,
      username TEXT,
      request_id TEXT NOT NULL,
      scan_job_id TEXT NOT NULL,
      collector_run_id TEXT,
      source_binding_id TEXT NOT NULL,
      query TEXT NOT NULL,
      pass_observation_id TEXT,
      observation_relation TEXT,
      pass_label TEXT,
      product TEXT,
      estimated_request_cost INTEGER,
      daily_requests_limit INTEGER,
      daily_tweets_limit INTEGER,
      account_priority INTEGER,
      requests_before INTEGER,
      requests_after INTEGER,
      tweets_before INTEGER,
      tweets_after INTEGER,
      fetched_count INTEGER,
      accepted_count INTEGER,
      returned_count INTEGER,
      failure_kind TEXT,
      cooldown_reason TEXT,
      reset_at TEXT,
      attribution_status TEXT
    )
    """


def account_usage_events_index_schemas() -> tuple[str, ...]:
    return (
        """
        CREATE INDEX IF NOT EXISTS idx_account_usage_events_provider_time
        ON account_usage_events (provider, occurred_at)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_account_usage_events_account_time
        ON account_usage_events (account_id, occurred_at)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_account_usage_events_request
        ON account_usage_events (request_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_account_usage_events_collector_run
        ON account_usage_events (collector_run_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_account_usage_events_pass_observation
        ON account_usage_events (pass_observation_id, event_type)
        """,
    )


def event_to_row(event: AccountUsageEvent) -> tuple[Any, ...]:
    return (
        event.event_id,
        event.event_type.value,
        event.provider,
        event.occurred_at.isoformat(),
        event.account_id,
        event.username,
        event.request_id,
        event.scan_job_id,
        event.collector_run_id,
        event.source_binding_id,
        event.query,
        event.pass_observation_id,
        event.observation_relation,
        event.pass_label,
        event.product,
        event.estimated_request_cost,
        event.daily_requests_limit,
        event.daily_tweets_limit,
        event.account_priority,
        event.requests_before,
        event.requests_after,
        event.tweets_before,
        event.tweets_after,
        event.fetched_count,
        event.accepted_count,
        event.returned_count,
        event.failure_kind,
        event.cooldown_reason,
        event.reset_at.isoformat() if event.reset_at else None,
        event.attribution_status.value if event.attribution_status else None,
    )
