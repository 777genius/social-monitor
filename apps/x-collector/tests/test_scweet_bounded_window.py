from dataclasses import replace
from datetime import UTC, datetime

import pytest

from support.canonical_graph_support import assert_expansion_builder_parity, lane, profile, sdk
from test_scweet_adapter import FakeScweet, FixedClock, request
from x_collector.canonical_graph_compiler import compile_expansion
from x_collector.domain import XCollectorInvalidRequestError
from x_collector.scweet_adapter import ScweetDailySearchCollector


def bounded_request(**changes):
    return replace(request(), window_hours=2,
                   window_end=datetime(2026, 11, 8, tzinfo=UTC), **changes)


def test_bounded_search_passes_exact_hours_to_scweet():
    fake = FakeScweet()
    collector = ScweetDailySearchCollector(lambda: fake, FixedClock(datetime(2026, 11, 8, tzinfo=UTC)))
    collector.collect_daily_search(bounded_request())
    assert fake.calls
    assert all((c['since'], c['until']) == ('2026-11-07_22:00:00_UTC',
                                             '2026-11-08_00:00:00_UTC') for c in fake.calls)


@pytest.mark.parametrize('query', ['test since:2026-11-01', 'test UNTIL:2026-11-09'])
def test_bounded_search_rejects_overriding_time_operators_before_account_use(query):
    def factory():
        raise AssertionError('account should not be used')
    collector = ScweetDailySearchCollector(factory, FixedClock(datetime(2026, 11, 8, tzinfo=UTC)))
    with pytest.raises(XCollectorInvalidRequestError):
        collector.collect_daily_search(bounded_request(query=query))


def test_offline_compiler_matches_native_bounded_window():
    item = lane()
    item['day'] = '2026-11-07'
    item['request']['window_hours'] = 2
    item['request']['window_end'] = '2026-11-08T00:00:00.000Z'
    result = compile_expansion([item], profile(), sdk())
    assert result['ok']
    streams = result['value']['invocations'][0]['passes'][0]['streams']
    assert streams[0]['splitWindow']['since'] == '2026-11-07_22:00:00_UTC'
    assert streams[-1]['splitWindow']['until'] == '2026-11-08_00:00:00_UTC'
    assert all('since:2026-11-07_' in s['rawQuery'] for s in streams)
    assert_expansion_builder_parity(result['value'], profile())


def test_bounded_search_rejects_fractional_boundary_before_account_use():
    def factory():
        raise AssertionError('account should not be used')
    collector = ScweetDailySearchCollector(factory, FixedClock(datetime(2026, 11, 8, tzinfo=UTC)))
    fractional = replace(bounded_request(), window_end=datetime(2026, 11, 8, microsecond=1, tzinfo=UTC))
    with pytest.raises(XCollectorInvalidRequestError):
        collector.collect_daily_search(fractional)
