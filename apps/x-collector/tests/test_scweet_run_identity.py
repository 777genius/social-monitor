from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import get_context
from multiprocessing.connection import Connection
from pathlib import Path

import x_collector.scweet_run_identity as run_identity
from x_collector.scweet_run_identity import ScweetRunIdentityTracker


def test_missing_durable_path_is_side_effect_free(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    thread_locks_before = dict(run_identity._THREAD_LOCKS)
    tracker = ScweetRunIdentityTracker(None)

    with tracker:
        assert tracker.collector_run_id is None

    assert tracker.collector_run_id is None
    assert tuple(tmp_path.iterdir()) == ()
    assert run_identity._THREAD_LOCKS == thread_locks_before


def test_resolves_one_new_durable_run(tmp_path: Path) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_runs_table(db_path)
    tracker = ScweetRunIdentityTracker(str(db_path))

    with tracker:
        insert_run(db_path, "run-exact")

    assert tracker.collector_run_id == "run-exact"


def test_multiple_new_runs_fail_closed(tmp_path: Path) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_runs_table(db_path)
    tracker = ScweetRunIdentityTracker(str(db_path))

    with tracker:
        insert_run(db_path, "run-one")
        insert_run(db_path, "run-two")

    assert tracker.collector_run_id is None


def test_concurrent_trackers_serialize_run_identity(tmp_path: Path) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_runs_table(db_path)

    def record(run_id: str) -> str | None:
        tracker = ScweetRunIdentityTracker(str(db_path))
        with tracker:
            insert_run(db_path, run_id)
        return tracker.collector_run_id

    with ThreadPoolExecutor(max_workers=2) as executor:
        observed = list(executor.map(record, ("run-a", "run-b")))

    assert set(observed) == {"run-a", "run-b"}


def test_cross_process_trackers_serialize_run_identity(tmp_path: Path) -> None:
    db_path = tmp_path / "scweet_state.db"
    create_runs_table(db_path)
    context = get_context("spawn")
    holder_parent, holder_child = context.Pipe()
    challenger_parent, challenger_child = context.Pipe()
    holder = context.Process(
        target=track_run_in_process,
        args=(db_path, "run-holder", holder_child, True),
    )
    challenger = context.Process(
        target=track_run_in_process,
        args=(db_path, "run-challenger", challenger_child, False),
    )

    holder.start()
    holder_child.close()
    assert receive(holder_parent) == "attempting"
    assert receive(holder_parent) == "entered"

    challenger.start()
    challenger_child.close()
    assert receive(challenger_parent) == "attempting"
    challenger_blocked_by_file_lock = not challenger_parent.poll(0.5)

    holder_parent.send("release")
    assert receive(holder_parent) == "run-holder"
    assert receive(challenger_parent) == "entered"
    assert receive(challenger_parent) == "run-challenger"
    holder.join(timeout=5)
    challenger.join(timeout=5)

    assert challenger_blocked_by_file_lock
    assert holder.exitcode == 0
    assert challenger.exitcode == 0


def track_run_in_process(
    db_path: Path,
    run_id: str,
    connection: Connection,
    hold_lock: bool,
) -> None:
    tracker = ScweetRunIdentityTracker(str(db_path))
    connection.send("attempting")
    with tracker:
        connection.send("entered")
        if hold_lock:
            assert connection.recv() == "release"
        insert_run(db_path, run_id)
    connection.send(tracker.collector_run_id)
    connection.close()


def receive(connection: Connection) -> str | None:
    assert connection.poll(5)
    value = connection.recv()
    assert value is None or isinstance(value, str)
    return value


def create_runs_table(db_path: Path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "CREATE TABLE runs (run_id TEXT NOT NULL PRIMARY KEY)",
        )


def insert_run(db_path: Path, run_id: str) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "INSERT INTO runs (run_id) VALUES (?)",
            (run_id,),
        )
