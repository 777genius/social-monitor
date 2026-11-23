import importlib.util
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location('ledger_admission', Path(__file__).with_name('ledger_admission.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def epoch(hour, minute=0):
    return datetime(2026, 11, 7, hour, minute, tzinfo=timezone.utc).timestamp()


def database(tmp_path, rows):
    path = tmp_path / 'ledger.db'
    with sqlite3.connect(path) as db:
        db.execute('create table runs (status text, started_at real, finished_at real, input_json text)')
        db.executemany('insert into runs values (?,?,?,?)', rows)
    return path


def payload(since='2026-11-07_00:00:00_UTC', until='2026-11-07_23:59:59_UTC'):
    return json.dumps({'since': since, 'until': until})


def test_causal_future_segment_and_subsequent_disjoint_day(tmp_path):
    path = database(tmp_path, [('completed', epoch(21), epoch(21, 4), payload()),
                               ('completed', epoch(22), epoch(22, 1), payload('2026-11-08_00:00:00_UTC', '2026-11-08_23:59:59_UTC'))])
    assert m.ledger_admits_future_segment(path, "2026-11-07")


def test_prior_query_completed_after_segment_start_is_refused(tmp_path):
    path = database(tmp_path, [('completed', epoch(21), epoch(22), payload())])
    assert not m.ledger_admits_future_segment(path, "2026-11-07")


def test_later_replay_even_failed_is_refused(tmp_path):
    path = database(tmp_path, [('completed', epoch(21), epoch(21, 4), payload()),
                               ('failed', epoch(22), epoch(22, 1), payload())])
    assert not m.ledger_admits_future_segment(path, "2026-11-07")


def test_unknown_bounds_and_unfinished_run_are_refused(tmp_path):
    path = database(tmp_path, [('running', epoch(21), None, payload())])
    assert not m.ledger_admits_future_segment(path, "2026-11-07")
    path.unlink()
    path = database(tmp_path, [('completed', epoch(21), epoch(21, 1), '{}')])
    assert not m.ledger_admits_future_segment(path, "2026-11-07")
