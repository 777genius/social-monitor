from dataclasses import replace
from datetime import timedelta

from support.canonical_search_invocation_support import (
    ParityCase, Observer, Repository, current, request, record, NOW,
)
from x_collector.candidate_rejection_cache import CandidateRejectionPolicy, snapshot_candidate
from x_collector.domain import SearchProduct
from x_collector.canonical_search_services import CanonicalObservationError


class CacheParity(ParityCase):
    def rows(self):
        return {identity: CandidateRejectionPolicy().new_rejection(
            current.post_from_scweet_record(record(identity, likes), SearchProduct.TOP), NOW)
            for identity, likes in [('a', 100), ('b', 50), ('c', 10)]}

    def pages(self):
        return [[record('a', 100), record('b', 50), record('c', 10)], [], []]

    def test_absent_empty_suppression_and_clipped_suppression(self):
        result, obs, _, calls = self.parity(self.pages())
        self.assertEqual(calls, [])
        self.assertEqual(obs.cache[0].outcome, 'not_configured')
        for rows in ({}, self.rows()):
            for limit in (1, 2, 3, 4):
                with self.subTest(rows=bool(rows), limit=limit):
                    result, obs, _, calls = self.parity(self.pages(), request(max_items=limit),
                        rows=rows, configured=True)
                    self.assertEqual([c[0] for c in calls], ['load', 'mark_seen', 'record_outcomes'])
                    self.assertEqual(calls[0][1][1], ('a', 'b', 'c'))
                    self.assertEqual(calls[1][1][1], tuple(rows)[:max(0, 3-limit)])
                    self.assertEqual(calls[1][1][2], NOW)
                    self.assertEqual(calls[2][1][3], NOW + timedelta(seconds=1))
                    self.assertEqual(len(result.posts), min(limit, 3))
                    self.assertEqual([o.operation for o in obs.cache],
                                     ['load', 'mark_seen', 'record_outcomes'])
                    self.assertEqual(obs.cache[0].rejections, tuple(rows.items()))
        _, obs, _, calls = self.parity([[], [], []], configured=True)
        self.assertEqual(calls, [])
        self.assertEqual(obs.cache[0].outcome, 'empty_pool')

    def test_load_mark_and_write_failures(self):
        full, _, _, _ = self.parity(self.pages(), request(max_items=1))
        for failure, operations in [('load', ['load']),
                ('mark_seen', ['load', 'mark_seen']),
                ('record_outcomes', ['load', 'mark_seen', 'record_outcomes'])]:
            result, obs, _, calls = self.parity(self.pages(), request(max_items=1),
                rows=self.rows(), failure=failure, configured=True)
            self.assertEqual([c[0] for c in calls], operations)
            self.assertEqual(sum(w.code == 'x_collector.rejection_cache_unavailable'
                                 for w in result.warnings), 1)
            self.assertEqual(obs.cache[-1].outcome, 'unavailable')
            if failure != 'record_outcomes':
                self.assertEqual(result.posts, full.posts)
            else:
                normal, _, _, _ = self.parity(self.pages(), request(max_items=1),
                    rows=self.rows(), configured=True)
                self.assertEqual(result.posts, normal.posts)

    def test_actual_branch_timestamps_preserve_supplied_times_and_clock_order(self):
        for failure in (None, 'load', 'mark_seen', 'record_outcomes'):
            with self.subTest(failure=failure):
                result, obs, events, calls = self.parity(
                    self.pages(), request(max_items=1), rows=self.rows(),
                    failure=failure, configured=True)
                self.assertEqual([e[0] for e in events], [
                    'clock', 'start', 'prepare', 'prepare', 'execute', 'search',
                    'prepare', 'execute', 'search', 'prepare', 'execute', 'search', 'clock'])
                self.assertEqual([e[1] for e in events if e[0] == 'clock'],
                                 [NOW, NOW + timedelta(seconds=1)])
                self.assertEqual(result.run.started_at, NOW)
                self.assertEqual(result.run.completed_at, NOW + timedelta(seconds=1))
                self.assertEqual([o.operation for o in obs.cache], [c[0] for c in calls])
                for fact, (operation, args) in zip(obs.cache, calls):
                    self.assertEqual(fact.outcome,
                                     'unavailable' if operation == failure else 'success')
                    self.assertEqual(fact.scope, args[0])
                    self.assertEqual(fact.ids, args[1])
                    if operation == 'load':
                        self.assertEqual(len(args), 2)
                        self.assertIsNone(fact.at)
                    else:
                        self.assertEqual(fact.at, args[-1])
                        self.assertEqual(fact.at, result.run.started_at
                                         if operation == 'mark_seen'
                                         else result.run.completed_at)

    def test_expiry_refresh_growth_threshold_policy_and_media_fingerprint(self):
        for change in ('expiry', 'refresh', 'growth', 'threshold', 'media', 'policy', 'reason'):
            with self.subTest(change=change):
                rows = self.rows()
                old = rows['a']
                pages = self.pages()
                req = request(max_items=2)
                if change == 'expiry':
                    rows['a'] = replace(old, expires_at=NOW)
                elif change == 'refresh':
                    rows['a'] = replace(old, refresh_after=NOW)
                elif change == 'growth':
                    pages[0][0]['likes'] = 150
                elif change == 'threshold':
                    rows['a'] = replace(old, snapshot=replace(old.snapshot,
                        metrics=replace(old.snapshot.metrics, likes=29)))
                elif change == 'media':
                    pages[0][0]['media']['image_links'] = ['https://example.invalid/changed']
                elif change == 'policy':
                    rows['a'] = replace(old, policy_version='synthetic-old-policy')
                else:
                    rows['a'] = replace(old, reason='synthetic-other-reason')
                result, obs, _, calls = self.parity(pages, req, rows=rows, configured=True)
                self.assertEqual(calls[1][1][1], ('b',))
                self.assertIn('a', [p.tweet_id for p in result.posts])
                if change == 'media':
                    observed = obs.passes[0][1][0].post
                    self.assertNotEqual(snapshot_candidate(observed).content_fingerprint,
                                        rows['a'].snapshot.content_fingerprint)

    def test_recorded_rejections_keep_media_and_completion_time(self):
        result, obs, _, calls = self.parity(self.pages(), request(max_items=1), configured=True)
        rejections = calls[-1][1][2]
        self.assertEqual(len(rejections), 2)
        for rejection in rejections:
            post = next(r.post for r in obs.passes[0][1]
                        if r.post.tweet_id == rejection.snapshot.tweet_id)
            self.assertEqual(rejection.snapshot, snapshot_candidate(post))
            self.assertEqual(rejection.refresh_after, NOW + timedelta(hours=30, seconds=1))
        self.assertEqual(obs.cache[-1].outcomes, rejections)

    def test_cache_observer_detached_and_unknown_write_not_replayed(self):
        class Mutator(Observer):
            def on_cache_observation(self, fact):
                if fact.rejections:
                    object.__setattr__(fact.rejections[0][1].snapshot,
                                       'content_fingerprint', 'synthetic-mutation')
                    object.__setattr__(fact.scope, 'tenant_id', 'synthetic-mutation')
        old = self.run_collector(self.oracle, self.pages(), request(max_items=1),
                                 Repository(self.rows()))
        new = self.run_collector(current, self.pages(), request(max_items=1),
                                 Repository(self.rows()), Mutator())
        self.assertEqual(old[:3], new[:3])
        for operation in ('load', 'mark_seen', 'record_outcomes'):
            class Failing(Observer):
                def on_cache_observation(self, fact):
                    if fact.operation == operation:
                        raise RuntimeError('synthetic capture failure')
            repo = Repository(self.rows())
            result = self.run_collector(current, self.pages(), request(max_items=1),
                                        repo, Failing())[3]
            self.assertIsInstance(result, CanonicalObservationError)
            self.assertEqual(sum(c[0] == operation for c in repo.calls), 1)
