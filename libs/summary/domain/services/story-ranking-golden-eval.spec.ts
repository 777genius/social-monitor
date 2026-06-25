import {
  tenantId,
  workspaceId,
  type Clock,
} from '@social-monitor/shared-kernel';

import { buildBriefingReaderBrief } from './briefing-reader-brief.factory';
import { StoryClusteringService } from './story-clustering.service';
import { STORY_RANKING_POLICY_V1 } from '../policies/story-ranking-policy';
import type {
  BriefingCitation,
  BriefingReaderBrief,
  BriefingTopStory,
} from '../entities/briefing-artifact';
import type {
  BriefingEvidenceItem,
  BriefingEvidenceSelection,
} from '../value-objects/briefing-evidence-item';

const clock: Clock = {
  now: () => new Date('2026-06-23T12:00:00.000Z'),
};

describe('story ranking golden eval', () => {
  it('orders deduplicated summary stories across provider systems without raw metric confusion', () => {
    const golden = buildReaderBriefFromEvidence([
      evidence({
        feedItemId: 'github-codex',
        sourceItemId: 'repo-openai-codex',
        providerKey: 'github-repo-radar',
        canonicalUrl: 'https://github.com/openai/codex',
        title: 'openai/codex',
        score: 2.35,
        providerMetrics: githubRepoMetrics(54000, 360),
      }),
      evidence({
        feedItemId: 'hn-codex',
        sourceItemId: 'hn-openai-codex',
        providerKey: 'hacker-news',
        canonicalUrl: 'https://news.ycombinator.com/item?id=4001',
        title: 'OpenAI codex launch discussion for openai/codex',
        score: 1.8,
        providerMetrics: hnMetrics(420, 96),
      }),
      evidence({
        feedItemId: 'github-openmontage',
        sourceItemId: 'trending-openmontage',
        providerKey: 'github-trending-page',
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
        title: 'calesthio/OpenMontage',
        score: 2.45,
        providerMetrics: githubTrendingMetrics(1, 3703),
      }),
      evidence({
        feedItemId: 'reddit-openmontage',
        sourceItemId: 'reddit-openmontage',
        providerKey: 'reddit',
        canonicalUrl:
          'https://www.reddit.com/r/LocalLLaMA/comments/openmontage',
        title: 'Weak Reddit discussion about calesthio/OpenMontage',
        score: 0.5,
        providerMetrics: redditMetrics(22, 9),
      }),
      ...sameSubredditDuplicates(),
      evidence({
        feedItemId: 'reddit-viral',
        sourceItemId: 'reddit-viral',
        providerKey: 'reddit',
        canonicalUrl:
          'https://www.reddit.com/r/programming/comments/viral_pricing_backlash',
        title: 'Viral Reddit pricing backlash',
        score: 2.35,
        providerMetrics: redditMetrics(8400, 1200),
      }),
      evidence({
        feedItemId: 'false-release',
        sourceItemId: 'false-release',
        providerKey: 'reddit',
        canonicalUrl: 'https://example.com/anthropic-release',
        title: 'Anthropic launches developer agents',
        storyKeyHint: 'title:anthropic-launches-developer-agents',
        score: 2.1,
      }),
      evidence({
        feedItemId: 'false-outage',
        sourceItemId: 'false-outage',
        providerKey: 'hacker-news',
        canonicalUrl: 'https://example.com/anthropic-outage',
        title: 'Anthropic launches developer agents',
        storyKeyHint: 'title:anthropic-launches-developer-agents',
        score: 2,
      }),
    ]);
    const { readerBrief, selection } = golden;
    const evalResult = evaluateGoldenRanking({
      readerBrief,
      selection,
      expectedTopReadTitles: [
        'openai/codex',
        'calesthio/OpenMontage',
        'Same subreddit browser-agent duplicate 1',
        'Viral Reddit pricing backlash',
        'Anthropic launches developer agents',
        'Anthropic launches developer agents',
      ],
      falseMergePairs: [['false-release', 'false-outage']],
      falseSplitPairs: [
        ['github-codex', 'hn-codex'],
        ['github-openmontage', 'reddit-openmontage'],
      ],
      crossProviderPreferences: [
        {
          preferredTitle: 'openai/codex',
          demotedTitle: 'Viral Reddit pricing backlash',
        },
        {
          preferredTitle: 'calesthio/OpenMontage',
          demotedTitle: 'Same subreddit browser-agent duplicate 1',
        },
      ],
    });

    expect(readerBrief.topReads.map((item) => item.title)).toEqual([
      'openai/codex',
      'calesthio/OpenMontage',
      'Same subreddit browser-agent duplicate 1',
      'Viral Reddit pricing backlash',
      'Anthropic launches developer agents',
      'Anthropic launches developer agents',
    ]);
    expect(readerBrief.topReads[0]?.providerMetrics).toEqual(
      expect.arrayContaining([
        { label: 'Story signal', value: '3.08' },
        { label: 'Cross-source support', value: '+0.3' },
        {
          label: 'Confirmed by',
          value: '2 providers: Repo Radar, Hacker News',
        },
        {
          label: 'Repo Radar evidence',
          value: '+360 stars / 48h, 54,000 total stars',
        },
        {
          label: 'Hacker News evidence',
          value: '420 points, 96 comments',
        },
      ]),
    );
    expect(readerBrief.topReads[1]?.providerMetrics).toEqual(
      expect.arrayContaining([
        { label: 'Story signal', value: '2.97' },
        {
          label: 'Confirmed by',
          value: '2 providers: GitHub Trending, Reddit',
        },
        {
          label: 'GitHub Trending evidence',
          value: '#1, +3,703 stars today',
        },
        {
          label: 'Reddit evidence',
          value: '22 score, 9 comments, 91% upvoted',
        },
      ]),
    );
    expect(readerBrief.topReads[2]?.providerMetrics).toEqual(
      expect.arrayContaining([
        { label: 'Evidence items', value: '10 source items' },
        { label: 'Same-source support', value: '+0.23' },
      ]),
    );
    expect(
      readerBrief.topReads.slice(4).map((item) => item.canonicalUrl),
    ).toEqual([
      'https://example.com/anthropic-release',
      'https://example.com/anthropic-outage',
    ]);
    expect(selection.rankingPolicyVersion).toBe(
      STORY_RANKING_POLICY_V1.version,
    );
    expect(evalResult).toEqual({
      topKOrderAccuracy: 1,
      falseMergeRate: 0,
      falseSplitRate: 0,
      crossProviderPreference: 1,
    });
    expect(evalResult.topKOrderAccuracy).toBeGreaterThanOrEqual(
      STORY_RANKING_POLICY_V1.evalThresholds.minTopKOrderAccuracy,
    );
    expect(evalResult.falseMergeRate).toBeLessThanOrEqual(
      STORY_RANKING_POLICY_V1.evalThresholds.maxFalseMergeRate,
    );
    expect(evalResult.falseSplitRate).toBeLessThanOrEqual(
      STORY_RANKING_POLICY_V1.evalThresholds.maxFalseSplitRate,
    );
    expect(evalResult.crossProviderPreference).toBeGreaterThanOrEqual(
      STORY_RANKING_POLICY_V1.evalThresholds.minCrossProviderPreference,
    );
  });

  it('keeps the reader-facing UX contract stable for normalized and raw metrics', () => {
    const { readerBrief } = buildReaderBriefFromEvidence([
      evidence({
        feedItemId: 'github-codex',
        sourceItemId: 'repo-openai-codex',
        providerKey: 'github-repo-radar',
        canonicalUrl: 'https://github.com/openai/codex',
        title: 'openai/codex',
        score: 2.35,
        providerMetrics: githubRepoMetrics(54000, 360),
      }),
      evidence({
        feedItemId: 'reddit-codex',
        sourceItemId: 'reddit-openai-codex',
        providerKey: 'reddit',
        canonicalUrl:
          'https://www.reddit.com/r/programming/comments/openai_codex',
        title: 'Reddit debates openai/codex',
        score: 1.7,
        providerMetrics: redditMetrics(510, 88),
      }),
    ]);

    expect({
      title: readerBrief.topReads[0]?.title,
      signalScore: readerBrief.topReads[0]?.signalScore,
      providerMetrics: readerBrief.topReads[0]?.providerMetrics,
      whyNow: readerBrief.topReads[0]?.whyNow,
    }).toMatchInlineSnapshot(`
{
  "providerMetrics": [
    {
      "label": "Story signal",
      "value": "3.08",
    },
    {
      "label": "Base signal",
      "value": "2.35",
    },
    {
      "label": "Cross-source support",
      "value": "+0.3",
    },
    {
      "label": "Provider diversity",
      "value": "+0.25",
    },
    {
      "label": "Freshness",
      "value": "+0.18",
    },
    {
      "label": "Confirmed by",
      "value": "2 providers: Repo Radar, Reddit",
    },
    {
      "label": "Evidence items",
      "value": "2 source items",
    },
    {
      "label": "Repo Radar evidence",
      "value": "+360 stars / 48h, 54,000 total stars",
    },
    {
      "label": "Reddit evidence",
      "value": "510 score, 88 comments, 91% upvoted",
    },
    {
      "label": "Evidence",
      "value": "GH Archive WatchEvent - hourly updated",
    },
    {
      "label": "Checked",
      "value": "2026-06-23T12:00:00.000Z",
    },
    {
      "label": "Source lag",
      "value": "GH Archive can lag by about an hour",
    },
    {
      "label": "Stars",
      "value": "54,000",
    },
    {
      "label": "Trend",
      "value": "+360 / 48h",
    },
  ],
  "signalScore": 3.08,
  "title": "openai/codex",
  "whyNow": "Current summary window has cross-source coverage from Repo Radar, Reddit and clustered 1 related item.",
}
`);
  });

  it('covers small communities, viral X noise, forks, HN GitHub discussions and repost traps', () => {
    const { readerBrief, selection } = buildReaderBriefFromEvidence([
      evidence({
        feedItemId: 'github-codex-main',
        sourceItemId: 'repo-openai-codex-main',
        providerKey: 'github-repo-radar',
        canonicalUrl: 'https://github.com/openai/codex',
        title: 'openai/codex',
        score: 2,
        providerMetrics: githubRepoMetrics(54000, 360),
      }),
      evidence({
        feedItemId: 'hn-codex-discussion',
        sourceItemId: 'hn-codex-discussion',
        providerKey: 'hacker-news',
        canonicalUrl: 'https://news.ycombinator.com/item?id=5001',
        title: 'Ask HN: Is openai/codex changing agent workflows?',
        bodyPreview:
          'HN links to https://github.com/openai/codex and compares real usage.',
        score: 1.6,
        providerMetrics: hnMetrics(210, 64),
      }),
      evidence({
        feedItemId: 'small-subreddit-codex',
        sourceItemId: 'reddit-small-codex',
        providerKey: 'reddit',
        canonicalUrl:
          'https://www.reddit.com/r/LocalLLaMA/comments/small_codex',
        title: 'Small subreddit tests openai/codex on local workflows',
        bodyPreview: 'Low-score but detailed discussion of openai/codex.',
        score: 0.95,
        providerMetrics: redditMetrics(38, 31),
      }),
      evidence({
        feedItemId: 'x-viral-agent-rumor',
        sourceItemId: 'x-viral-agent-rumor',
        providerKey: 'x',
        canonicalUrl: 'https://x.com/example/status/9001',
        title: 'Viral AI agent rumor thread',
        score: 2.6,
        providerMetrics: xMetrics(140000, 21000, 3500),
      }),
      evidence({
        feedItemId: 'github-codex-fork',
        sourceItemId: 'repo-fork-codex',
        providerKey: 'github-repo-radar',
        canonicalUrl: 'https://github.com/community/codex-fork',
        title: 'community/codex-fork',
        score: 1.7,
        providerMetrics: githubRepoMetrics(1200, 70),
      }),
      evidence({
        feedItemId: 'reddit-repost-main',
        sourceItemId: 'reddit-repost-main',
        providerKey: 'reddit',
        canonicalUrl: 'https://example.com/browser-agent-repost',
        title: 'Browser agent benchmark repost',
        score: 1.5,
        providerMetrics: redditMetrics(620, 80),
      }),
      evidence({
        feedItemId: 'reddit-repost-copy',
        sourceItemId: 'reddit-repost-copy',
        providerKey: 'reddit',
        canonicalUrl:
          'https://example.com/browser-agent-repost?utm_source=reddit',
        title: 'Browser agent benchmark repost copy',
        score: 1.4,
        providerMetrics: redditMetrics(310, 42),
      }),
      evidence({
        feedItemId: 'same-title-launch',
        sourceItemId: 'same-title-launch',
        providerKey: 'hacker-news',
        canonicalUrl: 'https://example.com/company-launch',
        title: 'Acme launches developer agents',
        score: 1.35,
      }),
      evidence({
        feedItemId: 'same-title-outage',
        sourceItemId: 'same-title-outage',
        providerKey: 'reddit',
        canonicalUrl: 'https://example.com/company-outage',
        title: 'Acme launches developer agents',
        score: 1.3,
      }),
    ]);
    const clusterByFeedItemId = clusterIdsByFeedItem(selection);
    const titles = readerBrief.topReads.map((item) => item.title);

    expect(titles.indexOf('openai/codex')).toBeLessThan(
      titles.indexOf('Viral AI agent rumor thread'),
    );
    expect(clusterByFeedItemId.get('github-codex-main')).toBe(
      clusterByFeedItemId.get('hn-codex-discussion'),
    );
    expect(clusterByFeedItemId.get('github-codex-main')).toBe(
      clusterByFeedItemId.get('small-subreddit-codex'),
    );
    expect(clusterByFeedItemId.get('github-codex-main')).not.toBe(
      clusterByFeedItemId.get('github-codex-fork'),
    );
    expect(clusterByFeedItemId.get('reddit-repost-main')).toBe(
      clusterByFeedItemId.get('reddit-repost-copy'),
    );
    expect(clusterByFeedItemId.get('same-title-launch')).not.toBe(
      clusterByFeedItemId.get('same-title-outage'),
    );
    expect(readerBrief.topReads[0]).toEqual(
      expect.objectContaining({
        title: 'openai/codex',
        confirmedProviderKeys: ['github-repo-radar', 'hacker-news', 'reddit'],
        confidence: expect.objectContaining({ level: 'high' }),
      }),
    );
  });
});

const buildReaderBriefFromEvidence = (
  items: readonly BriefingEvidenceItem[],
) => {
  const selection = new StoryClusteringService(clock).cluster({
    identity: {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scope: { type: 'workspace' },
    },
    items,
    limit: 10,
  });
  const citationMap = selection.selectedEvidence.map((item, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: 'title' as const,
    canonicalUrl: item.canonicalUrl,
  })) satisfies readonly BriefingCitation[];
  const citationIdByFeedItemId = new Map(
    citationMap.map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const evidenceById = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const topStories = selection.clusters.map((cluster) => {
    const representative = evidenceById.get(cluster.representativeFeedItemId);

    return {
      storyClusterId: cluster.id,
      title: representative?.title ?? cluster.storyKey,
      summary: `${representative?.title ?? cluster.storyKey} selected by golden ranking eval.`,
      topicIds: cluster.topicIds,
      providerKeys: cluster.providerKeys,
      citationIds: [
        cluster.representativeFeedItemId,
        ...cluster.duplicateFeedItemIds,
      ].flatMap((feedItemId) => citationIdByFeedItemId.get(feedItemId) ?? []),
    } satisfies BriefingTopStory;
  });

  return {
    selection,
    readerBrief: buildBriefingReaderBrief({
      headline: 'Golden ranking eval',
      executiveSummary:
        'Golden ranking eval validates provider-aware story order.',
      topStories,
      topicHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap,
      storyClusters: selection.clusters,
      selectedEvidence: selection.selectedEvidence,
      qualityFlags: [],
    }),
  };
};

type GoldenRankingEvalInput = {
  readonly readerBrief: BriefingReaderBrief;
  readonly selection: BriefingEvidenceSelection;
  readonly expectedTopReadTitles: readonly string[];
  readonly falseMergePairs: readonly (readonly [string, string])[];
  readonly falseSplitPairs: readonly (readonly [string, string])[];
  readonly crossProviderPreferences: readonly {
    readonly preferredTitle: string;
    readonly demotedTitle: string;
  }[];
};

const evaluateGoldenRanking = (input: GoldenRankingEvalInput) => {
  const actualTitles = input.readerBrief.topReads.map((item) => item.title);
  const clusterByFeedItemId = new Map<string, string>();
  for (const cluster of input.selection.clusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      clusterByFeedItemId.set(feedItemId, cluster.id);
    }
  }

  return {
    topKOrderAccuracy: ratio(
      input.expectedTopReadTitles.filter(
        (title, index) => actualTitles[index] === title,
      ).length,
      input.expectedTopReadTitles.length,
    ),
    falseMergeRate: ratio(
      input.falseMergePairs.filter(
        ([left, right]) =>
          clusterByFeedItemId.get(left) === clusterByFeedItemId.get(right),
      ).length,
      input.falseMergePairs.length,
    ),
    falseSplitRate: ratio(
      input.falseSplitPairs.filter(
        ([left, right]) =>
          clusterByFeedItemId.get(left) !== clusterByFeedItemId.get(right),
      ).length,
      input.falseSplitPairs.length,
    ),
    crossProviderPreference: ratio(
      input.crossProviderPreferences.filter(
        (preference) =>
          actualTitles.indexOf(preference.preferredTitle) >= 0 &&
          actualTitles.indexOf(preference.preferredTitle) <
            actualTitles.indexOf(preference.demotedTitle),
      ).length,
      input.crossProviderPreferences.length,
    ),
  };
};

const ratio = (value: number, total: number): number =>
  total <= 0 ? 0 : Math.round((value / total) * 1000) / 1000;

const clusterIdsByFeedItem = (
  selection: BriefingEvidenceSelection,
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const cluster of selection.clusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      result.set(feedItemId, cluster.id);
    }
  }

  return result;
};

const sameSubredditDuplicates = (): readonly BriefingEvidenceItem[] =>
  Array.from({ length: 10 }, (_, index) =>
    evidence({
      feedItemId: `same-subreddit-${index + 1}`,
      sourceItemId: `same-subreddit-${index + 1}`,
      providerKey: 'reddit',
      canonicalUrl: 'https://example.com/browser-agent-rumor',
      title: `Same subreddit browser-agent duplicate ${index + 1}`,
      score: 2.25 - index * 0.01,
      providerMetrics: redditMetrics(900 - index * 10, 80 - index),
    }),
  );

const evidence = (
  overrides: Partial<BriefingEvidenceItem>,
): BriefingEvidenceItem => ({
  feedItemId: 'feed-1',
  sourceItemId: 'source-1',
  sourceBindingId: 'binding-1',
  topicId: 'topic-ai',
  providerKey: 'reddit',
  canonicalUrl: 'https://example.com/default',
  title: 'Default evidence',
  publishedAt: new Date('2026-06-23T10:00:00.000Z'),
  observedAt: new Date('2026-06-23T10:30:00.000Z'),
  score: 1,
  whyImportant: ['Golden eval evidence.'],
  ...overrides,
});

const githubRepoMetrics = (stars: number, trendValue: number) => ({
  kind: 'github_repository',
  providerKey: 'github-repo-radar',
  sourceKey: 'repo-trending:48h:query:any',
  contentType: 'repository',
  evidenceSource: 'gh_archive_watch_event',
  evidenceLabel: 'GH Archive WatchEvent - hourly updated',
  stars,
  checkedAt: '2026-06-23T12:00:00.000Z',
  trendingDelta: { window: '48h', value: trendValue },
});

const githubTrendingMetrics = (rank: number, starsGained: number) => ({
  kind: 'github_trending_repository',
  providerKey: 'github-trending-page',
  sourceKey: 'github-trending-page:daily',
  contentType: 'repository',
  stars: 18398,
  forks: 2113,
  rank,
  starsGained,
  window: 'daily',
});

const redditMetrics = (score: number, comments: number) => ({
  kind: 'reddit_post',
  providerKey: 'reddit',
  sourceKey: 'r/programming',
  contentType: 'post',
  score,
  comments,
  upvoteRatio: 0.91,
});

const hnMetrics = (points: number, comments: number) => ({
  kind: 'hacker_news_story',
  providerKey: 'hacker-news',
  sourceKey: 'news.ycombinator.com',
  contentType: 'story',
  points,
  comments,
});

const xMetrics = (likes: number, reposts: number, replies: number) => ({
  kind: 'x_post',
  providerKey: 'x',
  sourceKey: 'x.com',
  contentType: 'post',
  likes,
  reposts,
  replies,
});
