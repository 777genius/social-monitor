import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedItem } from '../entities/feed-item';
import { feedSignalBaselineSampleFromItem } from '../value-objects/feed-signal-baseline-sample';
import { CohortBaselineFeedSignalNormalizer } from './cohort-baseline-feed-signal-normalizer';

const now = new Date('2026-06-23T12:00:00.000Z');

describe('CohortBaselineFeedSignalNormalizer', () => {
  it('normalizes Reddit posts against their community cohort instead of global raw score', () => {
    const items = [
      ...redditCohort('tiny-saas', [4, 8, 12, 22, 40]),
      redditItem('tiny-saas-target', 'tiny-saas', 55, 18),
      ...redditCohort('programming', [320, 420, 550, 850, 2500]),
      redditItem('programming-target', 'programming', 550, 75),
    ];
    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items,
      now,
    });

    const tinySignal = signals.get('tiny-saas-target');
    const programmingSignal = signals.get('programming-target');

    expect(tinySignal?.providerMetrics).toEqual(expect.objectContaining({
      kind: 'reddit_post',
      score: 55,
      comments: 18,
      sourceKey: 'r/tiny-saas',
    }));
    expect(programmingSignal?.providerMetrics).toEqual(expect.objectContaining({
      kind: 'reddit_post',
      score: 550,
      sourceKey: 'r/programming',
    }));
    expect(tinySignal?.normalizedSignal.score).toBeGreaterThan(
      programmingSignal?.normalizedSignal.score ?? 100,
    );
    expect(tinySignal?.normalizedSignal.cohort.fallback).toBe('exact');
    expect(tinySignal?.normalizedSignal.cohort.baselineWindow).toBe('24h');
    expect(tinySignal?.normalizedSignal.cohort.sampleSize).toBe(6);
  });

  it('uses historical rolling source cohorts without returning baseline-only items', () => {
    const target = redditItem('target', 'niche-builders', 90, 18);
    const history = [
      redditItem('history-1', 'niche-builders', 12, 2, {
        publishedAt: new Date('2026-06-21T09:00:00.000Z'),
        observedAt: new Date('2026-06-21T09:15:00.000Z'),
      }),
      redditItem('history-2', 'niche-builders', 18, 3, {
        publishedAt: new Date('2026-06-21T10:00:00.000Z'),
        observedAt: new Date('2026-06-21T10:15:00.000Z'),
      }),
      redditItem('history-3', 'niche-builders', 24, 5, {
        publishedAt: new Date('2026-06-22T10:00:00.000Z'),
        observedAt: new Date('2026-06-22T10:15:00.000Z'),
      }),
      redditItem('history-4', 'niche-builders', 30, 6, {
        publishedAt: new Date('2026-06-22T11:00:00.000Z'),
        observedAt: new Date('2026-06-22T11:15:00.000Z'),
      }),
    ];

    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [target],
      baselineSamples: history.flatMap((item) => {
        const sample = feedSignalBaselineSampleFromItem(item);

        return sample === undefined ? [] : [sample];
      }),
      now,
    });

    expect([...signals.keys()]).toEqual(['target']);
    expect(signals.get('target')?.normalizedSignal.cohort).toEqual(expect.objectContaining({
      fallback: 'source',
      baselineWindow: '7d',
      sampleSize: 5,
    }));
  });

  it('keeps confidence lower when a cohort has little evidence', () => {
    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [
        redditItem('one', 'indie-dev', 30, 4),
        redditItem('two', 'indie-dev', 65, 8),
      ],
      now,
    });

    expect(signals.get('two')?.normalizedSignal.confidence).toBeLessThan(0.5);
  });

  it('preserves negative Reddit raw score while normalizing from non-negative strength', () => {
    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [redditItem('downvoted', 'indie-dev', -3, 2)],
      now,
    });

    expect(signals.get('downvoted')?.providerMetrics).toEqual(expect.objectContaining({
      kind: 'reddit_post',
      score: -3,
      comments: 2,
    }));
    expect(signals.get('downvoted')?.normalizedSignal.score).toBe(50);
  });
});

const redditCohort = (
  subreddit: string,
  scores: readonly number[],
): readonly FeedItem[] => scores.map((score, index) =>
  redditItem(`${subreddit}-${index}`, subreddit, score, Math.max(1, Math.round(score / 5))),
);

const redditItem = (
  id: string,
  subreddit: string,
  score: number,
  comments: number,
  overrides: {
    readonly publishedAt?: Date;
    readonly observedAt?: Date;
  } = {},
): FeedItem =>
  FeedItem.publish({
    id,
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    topicId: 'topic-1',
    sourceItemId: `source-${id}`,
    sourceBindingId: `binding-${subreddit}`,
    providerKey: 'reddit',
    canonicalUrl: `https://reddit.test/r/${subreddit}/comments/${id}`,
    title: `Post ${id}`,
    bodyPreview: `Discussion ${id}`,
    authorHandle: 'author',
    publishedAt: overrides.publishedAt ?? new Date('2026-06-23T06:30:00.000Z'),
    observedAt: overrides.observedAt ?? new Date('2026-06-23T07:00:00.000Z'),
    providerMetadata: {
      subreddit,
      score,
      numComments: comments,
      upvoteRatio: 0.91,
    },
  });
