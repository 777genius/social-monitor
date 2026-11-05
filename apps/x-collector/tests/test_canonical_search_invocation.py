from dataclasses import FrozenInstanceError, replace
from datetime import timedelta
from unittest.mock import patch

from support.canonical_search_invocation_support import (
    ParityCase, Observer, current, request, record, NOW,
)
from x_collector.canonical_search_services import CanonicalObservationError
from x_collector.domain import SearchProduct, XCollectorRateLimitError, XCollectorUnavailableError
from x_collector.scoring import rank_candidates
from x_collector.search_budget import SearchBudgetDecision


class InvocationParity(ParityCase):
    def test_three_pass_order_thresholds_and_top_only(self):
        for products in ((SearchProduct.TOP, SearchProduct.LATEST), (SearchProduct.TOP,)):
            with self.subTest(products=products):
                result, observer, events, _ = self.parity(
                    [[record('a', 100)], [record('b', 90)], [record('c', 5)]],
                    request(search_products=products, cursor='synthetic-cursor'))
                passes = [e[1] for e in events if e[0] == 'execute']
                self.assertEqual([(p.label, p.product.value, p.limit,
                    p.min_likes, p.min_retweets, p.min_replies) for p in passes], [
                    ('top_base', 'top', 50, 30, 0, 0),
                    ('top_strict', 'top', 50, 90, 10, 5),
                    ('latest_discovery', 'latest', 50, 5, 0, 0)])
                self.assertIsNone(result.next_cursor)
                self.assertFalse(result.run.partial)
                self.assertEqual(result.run.requested_limit, 3)
                self.assertEqual(result.run.fetched_count, 3)
                self.assertEqual(observer.returned[0], result)
                self.assertEqual([e[0] for e in events], [
                    'clock', 'start', 'prepare', 'prepare', 'execute', 'search',
                    'prepare', 'execute', 'search', 'prepare', 'execute', 'search', 'clock'])

    def test_rank_gaps_duplicates_and_all_signals(self):
        invalid = {'tweet_id': 'invalid'}
        outside = {**record('outside'), 'timestamp': '2026-09-04T23:59:59Z'}
        result, obs, _, _ = self.parity([
            [None, invalid, outside, record('a', 100), record('b', 50)],
            [record('a', 20), record('c', 40)],
            [record('a', 200), record('b', 1)],
        ])
        self.assertEqual([r.rank for r in obs.passes[0][1]], [1, 2, 3, 4])
        self.assertIsNone(obs.passes[0][1][0].post)
        self.assertFalse(obs.passes[0][1][1].in_window)
        origins = {o.tweet_id: o for o in obs.returned[1]}
        self.assertEqual([(s.pass_label, s.rank) for s in origins['a'].all_candidate_signals],
                         [('top_base', 3), ('top_strict', 1), ('latest_discovery', 1)])
        self.assertEqual(origins['a'].chosen_signal.product, SearchProduct.LATEST)
        self.assertEqual(origins['b'].chosen_signal.product, SearchProduct.TOP)
        self.assertEqual(next(p for p in result.posts if p.tweet_id == 'a').metrics.likes, 200)

    def test_latest_to_top_preference_uses_actual_aggregator(self):
        # Ordinary planner orders TOP first. Reorder the injected budget to exercise
        # the existing aggregator's asymmetric LATEST -> TOP rule without a scorer copy.
        def reverse_budget(passes):
            return SearchBudgetDecision(tuple(reversed(passes)), 3, 24, None, None, None, None)
        result, obs, _, _ = self.parity([
            [record('a', 900)], [record('a', 2)], [record('a', 1)],
        ], budget=reverse_budget)
        self.assertEqual(result.posts[0].metrics.likes, 2)
        self.assertEqual(obs.returned[1][0].chosen_signal.pass_label, 'top_strict')
        self.assertEqual(len(obs.returned[1][0].all_candidate_signals), 3)

    def test_whole_pool_scoring_includes_below_predicate(self):
        pages = [[record('a', 200), record('b', 80), record('c', 40)], [], [record('low', 1)]]
        result, obs, _, _ = self.parity(pages, request(max_items=3))
        without, _, _, _ = self.parity([pages[0], [], []], request(max_items=3))
        scores = {p.tweet_id: p.trend_score for p in result.posts}
        self.assertTrue(any(scores.get(p.tweet_id) != p.trend_score for p in without.posts))
        self.assertEqual(obs.passes[2][1][0].post.metrics.likes, 1)

    def test_author_diversity_refill_limits_and_stable_order(self):
        same_author = [record(str(i), 50, author='same') for i in range(6)]
        for limit in (0, 1, 2, 4, 8):
            with self.subTest(limit=limit):
                result, _, _, _ = self.parity([same_author, [], []], request(max_items=limit))
                self.assertEqual(len(result.posts), min(limit, 6))
                self.assertEqual([p.tweet_id for p in result.posts],
                                 [str(i) for i in range(min(limit, 6))])
        result, _, _, _ = self.parity([
            same_author + [record('different', 5, author='other')], [], [],
        ], request(max_items=4))
        self.assertIn('different', [p.tweet_id for p in result.posts])
        # Identical duplicate pass ranks create equal confidence and engagement;
        # a later publication breaks the score tie only when age z is also tied.
        pages = [[record('a', 40), record('b', 40)],
                 [record('b', 40), record('a', 40)], []]
        tied, _, _, _ = self.parity(pages)
        self.assertEqual([p.tweet_id for p in tied.posts], ['a', 'b'])

    def test_late_failures_initial_failure_budget_depletion_and_failover_warning(self):
        for error in (XCollectorRateLimitError('synthetic rate'),
                      XCollectorUnavailableError('synthetic unavailable')):
            result, _, events, _ = self.parity([[record('a')], error, []])
            self.assertEqual(result.run.returned_count, 1)
            self.assertEqual(len([e for e in events if e[0] == 'execute']), 2)
            self.assertTrue(any(w.code.startswith('x_collector.partial_') for w in result.warnings))
            failed, observer, _, _ = self.parity([error, [], []])
            self.assertIsInstance(failed, type(error))
            self.assertIsNone(observer.returned)
        depleted, _, events, _ = self.parity([[record('a')], [], []], depleted=True)
        self.assertEqual(len([e for e in events if e[0] == 'execute']), 1)
        self.assertIn('x_collector.account_budget_depleted', [w.code for w in depleted.warnings])
        result, _, _, _ = self.parity([[record('a')], [], []], failovers=1)
        self.assertEqual(sum(w.code == 'x_collector.account_failover' for w in result.warnings), 3)

    def test_no_initial_budget_and_empty_filtered_pass(self):
        def exhausted(passes):
            return SearchBudgetDecision((), len(passes), 0, 0, 1, 0, NOW + timedelta(hours=1))
        result, obs, events, _ = self.parity([[], [], []], budget=exhausted)
        self.assertIsInstance(result, XCollectorRateLimitError)
        self.assertIsNone(obs.returned)
        self.assertFalse(any(e[0] == 'execute' for e in events))
        result, _, _, _ = self.parity([[{'tweet_id': 'invalid'}], {}, []])
        self.assertEqual(result.run.fetched_count, 0)
        self.assertIn('x_collector.pass_filtered', [w.code for w in result.warnings])

    def test_date_windows_exclusive_end_inclusive_start(self):
        for end in (NOW, NOW + timedelta(microseconds=1),
                    NOW + timedelta(hours=12), NOW - timedelta(hours=24)):
            req = request(window_end=end)
            pages = [[{**record('start'), 'timestamp': (end - timedelta(hours=24)).isoformat()},
                      {**record('end'), 'timestamp': end.isoformat()},
                      {**record('last'), 'timestamp': (end - timedelta(microseconds=1)).isoformat()}], [], []]
            result, _, events, _ = self.parity(pages, req)
            self.assertEqual({p.tweet_id for p in result.posts}, {'start', 'last'})
            search = next(e for e in events if e[0] == 'search')[2]
            self.assertEqual((search['since'], search['until']), self.oracle.scweet_date_window(req))
        self.assertEqual(current.scweet_date_window(request()), ('2026-09-05', '2026-09-05'))

    def test_detachment_and_observer_errors_fail_capture(self):
        class Mutator(Observer):
            def on_pass_records(self, search_pass, records):
                super().on_pass_records(search_pass, records)
                with self_case.assertRaises(FrozenInstanceError):
                    records[0].post.text = 'mutated'
                object.__setattr__(records[0].post.metrics, 'likes', 999999)
                object.__setattr__(records[0].post, 'text', 'mutated detached value')
                object.__setattr__(search_pass, 'label', 'mutated')

            def on_invocation_return(self, result, origins):
                object.__setattr__(result.posts[0], 'text', 'mutated detached result')
                object.__setattr__(origins[0].chosen_signal, 'rank', 999)
        self_case = self
        pages = [[record('a')], [record('b')], [record('c')]]
        baseline = self.run_collector(self.oracle, pages, request())
        mutated = self.run_collector(current, pages, request(), observer=Mutator())
        self.assertEqual(baseline[:3], mutated[:3])
        for hook in ('on_pass_records', 'on_cache_observation', 'on_invocation_return'):
            observer = Observer()
            def fail(*args):
                from x_collector.candidate_rejection_cache import CandidateRejectionCacheError
                raise CandidateRejectionCacheError('synthetic observer failure')
            setattr(observer, hook, fail)
            result = self.run_collector(current, pages, request(), observer=observer)[3]
            self.assertIsInstance(result, CanonicalObservationError)

    def test_ordinary_entrypoint_calls_shared_actual_ranker(self):
        from x_collector import canonical_search_invocation as invocation
        with patch.object(invocation, 'rank_candidates', wraps=rank_candidates) as ranker:
            result = self.run_collector(current, [[record('a')], [], []], request())[3]
            self.assertEqual(result.run.returned_count, 1)
            ranker.assert_called_once()
            self.assertEqual(len(ranker.call_args.args[0]), 1)

    def test_existing_infrastructure_executor_and_account_budget_clock_order(self):
        for capacity, count in ((24, 3), (16, 2), (8, 1), (0, 0)):
            result, obs, events, _ = self.parity(
                [[record('a')], [record('b')], [record('c')]],
                infrastructure=True, capacity=capacity)
            self.assertEqual(sum(e[0] == 'search' for e in events), count)
            if count:
                self.assertEqual(result.run.returned_count, count)
                self.assertEqual(events[0], ('clock', NOW))
                self.assertEqual(events[1], ('start',))
                self.assertEqual(events[2], ('clock', NOW + timedelta(seconds=1)))
                self.assertEqual(events[3], ('cooldowns', NOW + timedelta(seconds=1)))
                self.assertEqual(events[4], ('priorities', NOW + timedelta(seconds=1)))
            else:
                self.assertIsInstance(result, XCollectorRateLimitError)
                self.assertIsNone(obs.returned)

    def test_existing_failover_executor_retry_and_late_classification(self):
        result, _, events, _ = self.parity([
            RuntimeError('synthetic rate limit'), [record('a')],
            [record('b')], [record('c')],
        ], infrastructure=True, capacity=100)
        self.assertEqual(sum(e[0] == 'start' for e in events), 2)
        self.assertEqual(sum(e[0] == 'search' for e in events), 4)
        self.assertEqual(sum(w.code == 'x_collector.account_failover'
                             for w in result.warnings), 1)
        result, _, _, _ = self.parity([
            [record('a')], RuntimeError('synthetic transient failure'), [],
        ], infrastructure=True)
        self.assertIn('x_collector.partial_provider_failure', [w.code for w in result.warnings])
        result, _, events, _ = self.parity([
            RuntimeError('synthetic rate limit') for _ in range(3)
        ], infrastructure=True, capacity=100)
        self.assertIsInstance(result, XCollectorRateLimitError)
        self.assertEqual(sum(e[0] == 'start' for e in events), 3)

    def test_publication_tiebreak_and_strict_confidence(self):
        older = record('older', 0)
        newer = {**record('newer', 0), 'timestamp': '2026-09-05T13:00:00Z'}
        result, _, _, _ = self.parity([[older, newer], [newer, older], []])
        self.assertEqual(result.posts[0].trend_score, result.posts[1].trend_score)
        self.assertEqual([p.tweet_id for p in result.posts], ['newer', 'older'])
        base, _, _, _ = self.parity([[record('a')], [], []])
        strict, _, _, _ = self.parity([[record('a')], [record('a')], []])
        self.assertGreater(strict.posts[0].trend_score, base.posts[0].trend_score)

    def test_missing_malformed_metrics_and_originality_remain_normalizer_facts(self):
        pages = [[{**record('missing'), 'likes': None, 'retweets': None},
                  {**record('malformed'), 'likes': 'synthetic-invalid', 'comments': None},
                  {**record('unknown'), 'is_original': False}], [], []]
        result, obs, _, _ = self.parity(pages)
        posts = {p.tweet_id: p for p in result.posts}
        self.assertEqual(posts['missing'].metrics.likes, 0)
        self.assertFalse(posts['missing'].metrics.likes_observed)
        self.assertEqual(posts['malformed'].metrics.eligibility_state.value, 'malformed')
        self.assertEqual(posts['unknown'].content_kind.value, 'unknown')
