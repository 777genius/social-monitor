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
        with sqlite3.connect(self._db_path) as connection:
            connection.execute(account_usage_events_schema())
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
                  source_binding_id,
                  query,
                  pass_label,
                  product,
                  estimated_request_cost,
                  requests_before,
                  requests_after,
                  tweets_before,
                  tweets_after,
                  fetched_count,
                  accepted_count,
                  returned_count,
                  failure_kind,
                  cooldown_reason,
                  reset_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [event_to_row(event) for event in events],
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
      source_binding_id TEXT NOT NULL,
      query TEXT NOT NULL,
      pass_label TEXT,
      product TEXT,
      estimated_request_cost INTEGER,
      requests_before INTEGER,
      requests_after INTEGER,
      tweets_before INTEGER,
      tweets_after INTEGER,
      fetched_count INTEGER,
      accepted_count INTEGER,
      returned_count INTEGER,
      failure_kind TEXT,
      cooldown_reason TEXT,
      reset_at TEXT
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
        event.source_binding_id,
        event.query,
        event.pass_label,
        event.product,
        event.estimated_request_cost,
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
    )
