"""Synthetic-only differential harness; oracle bytes are pinned, never extracted code."""
from __future__ import annotations

import builtins
from contextlib import ExitStack
from copy import deepcopy
from dataclasses import asdict, replace
from datetime import UTC, datetime, timedelta
import hashlib
import types
import os
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from x_collector import scweet_adapter as current
from x_collector.account_usage_observer import NoopAccountUsageObserver
from x_collector.candidate_rejection_cache import CandidateRejectionCacheError
from x_collector.domain import DailySearchRequest, SearchProduct

BASELINE = Path(__file__).resolve().parents[1] / 'fixtures/canonical_search/baseline_scweet_adapter.py'
NOW = datetime(2026, 9, 6, tzinfo=UTC)


def load_oracle():
    expected = '539d6ee1ac7e17b0ff1e7e9bb9a261a4f36aa4906d2905f989e30361f75241e1'
    source = BASELINE.read_bytes()
    if hashlib.sha256(source).hexdigest() != expected:
        raise ValueError('Canonical search baseline SHA-256 mismatch')
    name = 'x_collector.e1_pinned_baseline'
    module = types.ModuleType(name)
    module.__file__ = str(BASELINE)
    module.__package__ = 'x_collector'
    sys.modules[name] = module
    exec(compile(source, str(BASELINE), 'exec'), module.__dict__)
    return module


def request(**changes):
    return replace(DailySearchRequest(
        'synthetic-request', 'synthetic-tenant', 'synthetic-workspace',
        'synthetic-binding', 'synthetic-scan', 'synthetic-correlation',
        'synthetic research', 'en', 24, NOW,
        (SearchProduct.TOP, SearchProduct.LATEST), 50, 3, 30, 0, 0, None,
    ), **changes)


def record(identity, likes=40, author=None, **changes):
    return dict(tweet_id=identity, text='synthetic research fixture ' + identity,
                timestamp='2026-09-05T12:00:00Z', likes=likes,
                retweets=0, comments=0, is_original=True,
                tweet_url='https://example.invalid/post/' + identity,
                user={'screen_name': author or 'synthetic_' + identity, 'name': 'Fixture'},
                media={'image_links': ['https://example.invalid/media/' + identity]},
                **changes)


class Clock:
    def __init__(self, events):
        self.events = events
        self.count = 0

    def now(self):
        value = NOW + timedelta(seconds=self.count)
        self.count += 1
        self.events.append(('clock', value))
        return value


class Repository:
    def __init__(self, rows=None, failure=None):
        self.rows = deepcopy(rows or {})
        self.failure = failure
        self.calls = []

    def call(self, operation, *args):
        self.calls.append((operation, deepcopy(args)))
        if self.failure == operation:
            raise CandidateRejectionCacheError('synthetic unavailable')

    def load_rejections(self, scope, ids):
        self.call('load', scope, ids)
        return self.rows

    def mark_seen(self, scope, ids, now):
        self.call('mark_seen', scope, ids, now)

    def record_outcomes(self, scope, ids, rejections, now):
        self.call('record_outcomes', scope, ids, rejections, now)


class Observer:
    def __init__(self):
        self.passes = []
        self.cache = []
        self.returned = None

    def on_pass_records(self, search_pass, records):
        self.passes.append((search_pass, records))

    def on_cache_observation(self, fact):
        self.cache.append(fact)

    def on_invocation_return(self, result, origins):
        self.returned = result, origins


class ParityCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.oracle = load_oracle()

    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        original_import = builtins.__import__

        def guarded_import(name, *args, **kwargs):
            if name == 'Scweet' or name.startswith('Scweet.'):
                raise AssertionError('Real Scweet import prohibited')
            return original_import(name, *args, **kwargs)

        self.stack.enter_context(patch('builtins.__import__', guarded_import))
        self.stack.enter_context(patch('sqlite3.connect', side_effect=AssertionError('No SQLite')))
        for module in (current, self.oracle):
            for name in ('ScweetAccountPoolLedger', 'SqliteAccountUsageEventRepository',
                         'SqliteCandidateRejectionRepository'):
                self.stack.enter_context(patch.object(module, name,
                    side_effect=AssertionError('Real repository factory prohibited')))
            self.stack.enter_context(patch.object(module.ScweetDailySearchCollector,
                'from_settings', side_effect=AssertionError('Real composition prohibited')))

    def run_collector(self, module, pages, req, repository=None, observer=None,
                      budget=None, depleted=False, failovers=0, infrastructure=False, capacity=None):
        events = []
        clock = Clock(events)
        usage_observer = NoopAccountUsageObserver()
        pages = deepcopy(pages)

        class Synthetic:
            def search(self, query, **kwargs):
                events.append(('search', query, kwargs))
                page = pages.pop(0)
                if isinstance(page, Exception):
                    raise page
                return page

        session = Synthetic()

        def start():
            events.append(('start',))
            return session

        ledger = None
        if capacity is not None:
            from x_collector.account_pool import AccountCapacity, AccountPoolLimits, AccountPoolSnapshot
            class Ledger:
                def snapshot(self, now):
                    events.append(('snapshot', now))
                    account = AccountCapacity(1, 'synthetic_account', 1, 0, 0,
                        capacity, 600, 100, capacity, 600, None, None, None, False, None)
                    return AccountPoolSnapshot(now, AccountPoolLimits(capacity, 600), (account,))

                def apply_profile_cooldowns(self, now):
                    events.append(('cooldowns', now))

                def apply_collection_priorities(self, now):
                    events.append(('priorities', now))
            ledger = Ledger()
        collector = module.ScweetDailySearchCollector(start, clock,
            account_pool_ledger=ledger, candidate_rejection_repository=repository)

        def execute(session, *, request, search_pass, since, until):
            events.append(('execute', search_pass))
            records = module.run_scweet_search_pass(session, request=request,
                search_pass=search_pass, since=since, until=until)
            usage = usage_observer.begin_pass(request, search_pass, 8)
            return records, session, usage, failovers

        if not infrastructure:
            collector._run_pass_with_failover = execute
        if capacity is None:
            collector._prepare_account_pool = lambda: events.append(('prepare',))
            collector._account_budget_is_depleted = lambda: depleted
        if budget is not None:
            collector._budget_search_passes = lambda passes: budget(passes)
        try:
            if observer is None:
                result = collector.collect_daily_search(req)
            else:
                result = collector.collect_daily_search(req, observer)
            outcome = ('result', asdict(result))
        except Exception as exc:
            result = exc
            outcome = ('error', type(exc).__name__, str(exc), vars(exc))
        return outcome, events, repository.calls if repository else [], result

    def parity(self, pages, req=None, rows=None, failure=None, configured=False, **kwargs):
        req = req or request()
        old_repo = Repository(rows, failure) if configured else None
        new_repo = Repository(rows, failure) if configured else None
        old = self.run_collector(self.oracle, pages, req, old_repo, **kwargs)
        observer = Observer()
        new = self.run_collector(current, pages, req, new_repo, observer, **kwargs)
        off = self.run_collector(current, pages, req,
            Repository(rows, failure) if configured else None, **kwargs)
        self.assertEqual(old[:3], new[:3])
        self.assertEqual(old[:3], off[:3])
        if output_name := os.environ.get('CANONICAL_SEARCH_PARITY_OUTPUT'):
            output = Path(output_name)
            if not output.is_absolute():
                raise ValueError('Parity output must be an explicit absolute path')
            with output.open('a') as stream:
                stream.write(json.dumps({'test': self.id(), 'baseline': old[:3],
                                         'extracted': new[:3]}, default=str) + '\n')
        return new[3], observer, new[1], new[2]
