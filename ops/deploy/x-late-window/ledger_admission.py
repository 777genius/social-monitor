"""Read-only causal evidence for the one approved late 2026-11-07 X segment.

The router must hold its native lock and independently establish its one-shot
claim, scoped Postgres evidence, quiescence, and durable partial receipt.
This check does not provide authorization or execute collection itself.
"""
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

ALLOWED_START_HOURS = {"2026-11-04": 21, "2026-11-07": 22,
                       "2026-11-08": 21, "2026-11-10": 21,
                       "2026-11-11": 21, "2026-11-12": 21,
                       "2026-11-13": 21}


def parse_bound(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError("missing time bound")
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d_%H:%M:%S_UTC")
    except ValueError:
        raise ValueError("unrecognized time bound") from None
    return parsed.replace(tzinfo=timezone.utc)


def ledger_admits_future_segment(path: Path, day: str) -> bool:
    if path.is_symlink() or not path.is_file() or day not in ALLOWED_START_HOURS:
        return False
    start = datetime.fromisoformat(day).replace(hour=ALLOWED_START_HOURS[day], tzinfo=timezone.utc)
    end = start.replace(hour=0) + timedelta(days=1)
    previous = 0
    try:
        uri = path.resolve().as_uri() + "?mode=ro"
        with sqlite3.connect(uri, uri=True) as db:
            db.execute("BEGIN")
            rows = db.execute(
                "SELECT status, started_at, finished_at, input_json FROM runs WHERE started_at >= ? OR finished_at >= ? OR finished_at IS NULL",
                (start.replace(hour=0).timestamp(), start.replace(hour=0).timestamp()),
            )
            for status, started, finished, payload in rows:
                data = json.loads(payload)
                since = parse_bound(data["since"])
                until = parse_bound(data["until"])
                if since >= until:
                    return False
                if since < end and until >= start:
                    if status not in ("completed", "failed") or finished is None:
                        return False
                    if started >= start.timestamp() or finished >= start.timestamp():
                        return False
                    previous += 1
    except (OSError, sqlite3.Error, ValueError, TypeError, KeyError):
        return False
    return previous > 0


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3 or not ledger_admits_future_segment(Path(sys.argv[1]), sys.argv[2]):
        raise SystemExit(1)
