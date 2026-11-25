from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

from .candidate_rejection_cache import (
    CandidateRejection,
    CandidateRejectionCacheError,
    CandidateRejectionScope,
    CandidateSnapshot,
    MetricWatermark,
)


_SQLITE_LOOKUP_BATCH_SIZE = 400


class SqliteCandidateRejectionRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._schema_ready = False

    def load_rejections(
        self,
        scope: CandidateRejectionScope,
        tweet_ids: tuple[str, ...],
    ) -> dict[str, CandidateRejection]:
        unique_ids = tuple(dict.fromkeys(tweet_ids))
        if not unique_ids:
            return {}

        with self._connection() as connection:
            self._ensure_schema(connection)
            rows: list[sqlite3.Row] = []
            for offset in range(0, len(unique_ids), _SQLITE_LOOKUP_BATCH_SIZE):
                batch = unique_ids[offset : offset + _SQLITE_LOOKUP_BATCH_SIZE]
                placeholders = ",".join("?" for _ in batch)
                rows.extend(
                    connection.execute(
                        f"""
                        SELECT *
                        FROM x_candidate_rejections
                        WHERE tenant_id = ?
                          AND workspace_id = ?
                          AND source_binding_id = ?
                          AND query_scope_hash = ?
                          AND tweet_id IN ({placeholders})
                        """,
                        (*scope_values(scope), *batch),
                    ).fetchall(),
                )

        try:
            return {row["tweet_id"]: rejection_from_row(row) for row in rows}
        except (KeyError, TypeError, ValueError) as exc:
            raise CandidateRejectionCacheError(
                "candidate rejection cache contains an invalid record",
            ) from exc

    def record_outcomes(
        self,
        scope: CandidateRejectionScope,
        selected_tweet_ids: tuple[str, ...],
        rejections: tuple[CandidateRejection, ...],
        now: datetime,
    ) -> None:
        selected_ids = tuple(dict.fromkeys(selected_tweet_ids))
        with self._connection() as connection:
            self._ensure_schema(connection)
            delete_expired_rejections(connection, now)
            if selected_ids:
                connection.executemany(
                    """
                    DELETE FROM x_candidate_rejections
                    WHERE tenant_id = ?
                      AND workspace_id = ?
                      AND source_binding_id = ?
                      AND query_scope_hash = ?
                      AND tweet_id = ?
                    """,
                    [(*scope_values(scope), tweet_id) for tweet_id in selected_ids],
                )
            upsert_rejections(connection, scope, rejections, now)

    def record_rejections(
        self,
        scope: CandidateRejectionScope,
        rejections: tuple[CandidateRejection, ...],
        now: datetime,
    ) -> None:
        if not rejections:
            return

        with self._connection() as connection:
            self._ensure_schema(connection)
            delete_expired_rejections(connection, now)
            upsert_rejections(connection, scope, rejections, now)

    def mark_seen(
        self,
        scope: CandidateRejectionScope,
        tweet_ids: tuple[str, ...],
        now: datetime,
    ) -> None:
        unique_ids = tuple(dict.fromkeys(tweet_ids))
        if not unique_ids:
            return

        with self._connection() as connection:
            self._ensure_schema(connection)
            connection.executemany(
                """
                UPDATE x_candidate_rejections
                SET last_seen_at = ?, seen_count = seen_count + 1
                WHERE tenant_id = ?
                  AND workspace_id = ?
                  AND source_binding_id = ?
                  AND query_scope_hash = ?
                  AND tweet_id = ?
                """,
                [
                    (now.isoformat(), *scope_values(scope), tweet_id)
                    for tweet_id in unique_ids
                ],
            )

    def remove(
        self,
        scope: CandidateRejectionScope,
        tweet_ids: tuple[str, ...],
    ) -> None:
        unique_ids = tuple(dict.fromkeys(tweet_ids))
        if not unique_ids:
            return

        with self._connection() as connection:
            self._ensure_schema(connection)
            connection.executemany(
                """
                DELETE FROM x_candidate_rejections
                WHERE tenant_id = ?
                  AND workspace_id = ?
                  AND source_binding_id = ?
                  AND query_scope_hash = ?
                  AND tweet_id = ?
                """,
                [(*scope_values(scope), tweet_id) for tweet_id in unique_ids],
            )

    def _connect(self) -> sqlite3.Connection:
        if self._db_path != ":memory:":
            Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._db_path, timeout=0.25)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self, connection: sqlite3.Connection) -> None:
        if self._schema_ready:
            return
        ensure_candidate_rejections_schema(connection)
        self._schema_ready = True

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        try:
            with self._connect() as connection:
                yield connection
        except sqlite3.Error as exc:
            raise CandidateRejectionCacheError(
                "candidate rejection cache is unavailable",
            ) from exc


def ensure_candidate_rejections_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS x_candidate_rejections (
          tenant_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          source_binding_id TEXT NOT NULL,
          query_scope_hash TEXT NOT NULL,
          tweet_id TEXT NOT NULL,
          content_fingerprint TEXT NOT NULL,
          likes INTEGER NOT NULL,
          retweets INTEGER NOT NULL,
          replies INTEGER NOT NULL,
          quotes INTEGER,
          views INTEGER,
          reason TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          refresh_after TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          first_seen_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          seen_count INTEGER NOT NULL,
          PRIMARY KEY (
            tenant_id,
            workspace_id,
            source_binding_id,
            query_scope_hash,
            tweet_id
          )
        )
        """,
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_x_candidate_rejections_expiry
        ON x_candidate_rejections (expires_at)
        """,
    )


def delete_expired_rejections(
    connection: sqlite3.Connection,
    now: datetime,
) -> None:
    connection.execute(
        """
        DELETE FROM x_candidate_rejections
        WHERE rowid IN (
          SELECT rowid
          FROM x_candidate_rejections
          WHERE expires_at <= ?
          LIMIT 500
        )
        """,
        (now.isoformat(),),
    )


def upsert_rejections(
    connection: sqlite3.Connection,
    scope: CandidateRejectionScope,
    rejections: tuple[CandidateRejection, ...],
    now: datetime,
) -> None:
    if not rejections:
        return
    connection.executemany(
        """
        INSERT INTO x_candidate_rejections (
          tenant_id,
          workspace_id,
          source_binding_id,
          query_scope_hash,
          tweet_id,
          content_fingerprint,
          likes,
          retweets,
          replies,
          quotes,
          views,
          reason,
          policy_version,
          refresh_after,
          expires_at,
          first_seen_at,
          last_seen_at,
          seen_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (
          tenant_id,
          workspace_id,
          source_binding_id,
          query_scope_hash,
          tweet_id
        ) DO UPDATE SET
          content_fingerprint = excluded.content_fingerprint,
          likes = excluded.likes,
          retweets = excluded.retweets,
          replies = excluded.replies,
          quotes = excluded.quotes,
          views = excluded.views,
          reason = excluded.reason,
          policy_version = excluded.policy_version,
          refresh_after = excluded.refresh_after,
          expires_at = excluded.expires_at,
          last_seen_at = excluded.last_seen_at,
          seen_count = x_candidate_rejections.seen_count + 1
        """,
        [rejection_to_row(scope, rejection, now) for rejection in rejections],
    )


def scope_values(scope: CandidateRejectionScope) -> tuple[str, ...]:
    return (
        scope.tenant_id,
        scope.workspace_id,
        scope.source_binding_id,
        scope.query_scope_hash,
    )


def rejection_to_row(
    scope: CandidateRejectionScope,
    rejection: CandidateRejection,
    now: datetime,
) -> tuple[Any, ...]:
    metrics = rejection.snapshot.metrics
    return (
        *scope_values(scope),
        rejection.snapshot.tweet_id,
        rejection.snapshot.content_fingerprint,
        metrics.likes,
        metrics.retweets,
        metrics.replies,
        metrics.quotes,
        metrics.views,
        rejection.reason,
        rejection.policy_version,
        rejection.refresh_after.isoformat(),
        rejection.expires_at.isoformat(),
        now.isoformat(),
        now.isoformat(),
        rejection.seen_count,
    )


def rejection_from_row(row: sqlite3.Row) -> CandidateRejection:
    return CandidateRejection(
        snapshot=CandidateSnapshot(
            tweet_id=row["tweet_id"],
            content_fingerprint=row["content_fingerprint"],
            metrics=MetricWatermark(
                likes=row["likes"],
                retweets=row["retweets"],
                replies=row["replies"],
                quotes=row["quotes"],
                views=row["views"],
            ),
        ),
        reason=row["reason"],
        policy_version=row["policy_version"],
        refresh_after=datetime.fromisoformat(row["refresh_after"]),
        expires_at=datetime.fromisoformat(row["expires_at"]),
        seen_count=row["seen_count"],
    )
