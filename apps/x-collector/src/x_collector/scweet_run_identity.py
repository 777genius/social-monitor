from __future__ import annotations

import fcntl
import sqlite3
from pathlib import Path
from threading import Lock
from types import TracebackType
from typing import TextIO


_LOCKS_GUARD = Lock()
_THREAD_LOCKS: dict[str, Lock] = {}


class ScweetRunIdentityTracker:
    """Resolve the one durable Scweet run created by a search call.

    The sidecar file lock serializes searches performed by Social Monitor
    processes that share one Scweet database. A set difference is accepted
    only when exactly one run was added; every other outcome fails closed to
    an unknown run identity.
    """

    def __init__(self, db_path: str | None) -> None:
        self._db_path = db_path
        self._lock_key = (
            db_path
            if db_path is None or db_path == ":memory:"
            else str(Path(db_path).resolve())
        )
        self._thread_lock: Lock | None = None
        self._lock_file: TextIO | None = None
        self._before: frozenset[str] | None = None
        self._tracking = False
        self.collector_run_id: str | None = None

    def __enter__(self) -> "ScweetRunIdentityTracker":
        if self._db_path is None or self._db_path == ":memory:":
            return self

        assert self._lock_key is not None
        self._thread_lock = thread_lock_for(self._lock_key)
        self._thread_lock.acquire()
        try:
            lock_path = Path(f"{self._lock_key}.social-monitor-run.lock")
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            self._lock_file = lock_path.open("a+", encoding="utf-8")
            fcntl.flock(self._lock_file.fileno(), fcntl.LOCK_EX)
            self._before = read_scweet_run_ids(self._db_path)
            self._tracking = True
        except Exception:
            self._release_locks()

        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool:
        del exc_type, exc_value, traceback
        if not self._tracking or self._db_path is None:
            return False
        try:
            after = read_scweet_run_ids(self._db_path)
            if self._before is not None and after is not None:
                added = after.difference(self._before)
                if len(added) == 1:
                    self.collector_run_id = next(iter(added))
        finally:
            self._release_locks()

        return False

    def _release_locks(self) -> None:
        if self._lock_file is not None:
            try:
                try:
                    fcntl.flock(self._lock_file.fileno(), fcntl.LOCK_UN)
                except OSError:
                    pass
            finally:
                try:
                    self._lock_file.close()
                except OSError:
                    pass
                self._lock_file = None
        if self._thread_lock is not None:
            self._thread_lock.release()
            self._thread_lock = None
        self._tracking = False


def thread_lock_for(db_path: str) -> Lock:
    with _LOCKS_GUARD:
        lock = _THREAD_LOCKS.get(db_path)
        if lock is None:
            lock = Lock()
            _THREAD_LOCKS[db_path] = lock
        return lock


def read_scweet_run_ids(db_path: str) -> frozenset[str] | None:
    try:
        with sqlite3.connect(db_path, timeout=30.0) as connection:
            table = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'runs'",
            ).fetchone()
            if table is None:
                return frozenset()
            return frozenset(
                str(row[0])
                for row in connection.execute("SELECT run_id FROM runs")
                if row[0] is not None and str(row[0]).strip()
            )
    except sqlite3.Error:
        return None
