import { buildBriefingReaderBrief } from './briefing-reader-brief.factory';

describe('buildBriefingReaderBrief', () => {
  it('keeps single-provider repo radar briefings source-aware without repeating repo names as trend signals', () => {
    const readerBrief = buildBriefingReaderBrief({
      headline: 'AI repo radar',
      executiveSummary:
        'Repo Radar found openai/codex, firecrawl/firecrawl and langchain-ai/langgraph as useful repository links.',
      topStories: [
        {
          storyClusterId: 'cluster-1',
          title: 'openai/codex',
          summary: 'Fast-growing AI coding agent repository.',
          topicIds: ['ai-developer-tools'],
          providerKeys: ['github-repo-radar'],
          citationIds: ['citation-1'],
        },
        {
          storyClusterId: 'cluster-2',
          title: 'firecrawl/firecrawl',
          summary: 'Web data infrastructure is gaining developer attention.',
          topicIds: ['ai-developer-tools'],
          providerKeys: ['github-repo-radar'],
          citationIds: ['citation-2'],
        },
      ],
      topicHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: 'citation-1',
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          providerKey: 'github-repo-radar',
          field: 'title',
          canonicalUrl: 'https://github.com/openai/codex',
        },
        {
          citationId: 'citation-2',
          feedItemId: 'feed-2',
          sourceItemId: 'source-2',
          providerKey: 'github-repo-radar',
          field: 'title',
          canonicalUrl: 'https://github.com/firecrawl/firecrawl',
        },
      ],
      storyClusters: [
        {
          id: 'cluster-1',
          storyKey: 'github:openai/codex',
          representativeFeedItemId: 'feed-1',
          duplicateFeedItemIds: [],
          topicIds: ['ai-developer-tools'],
          providerKeys: ['github-repo-radar'],
          score: 1,
          observedAtRange: {
            startedAt: new Date('2026-06-23T08:00:00.000Z'),
            endedAt: new Date('2026-06-23T09:00:00.000Z'),
          },
          whyImportant: ['Repository is gaining stars quickly.'],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          sourceBindingId: 'binding-1',
          topicId: 'ai-developer-tools',
          providerKey: 'github-repo-radar',
          canonicalUrl: 'https://github.com/openai/codex',
          title: 'openai/codex',
          publishedAt: new Date('2026-06-23T08:00:00.000Z'),
          observedAt: new Date('2026-06-23T09:00:00.000Z'),
          score: 1,
          whyImportant: ['Repository is gaining stars quickly.'],
          providerMetrics: {
            kind: 'github_repository',
            providerKey: 'github-repo-radar',
            sourceKey: 'repo-trending:48h',
            contentType: 'repository',
            stars: 54000,
            forks: 2000,
            trendingDelta: {
              window: '48h',
              value: 360,
            },
            trendDeltas: [
              { window: '24h', value: 210 },
              { window: '48h', value: 360 },
              { window: '7d', value: 1200 },
              { window: '30d', value: 4800 },
              { window: '90d', value: 11000 },
            ],
          },
        },
        {
          feedItemId: 'feed-2',
          sourceItemId: 'source-2',
          sourceBindingId: 'binding-1',
          topicId: 'ai-developer-tools',
          providerKey: 'github-repo-radar',
          canonicalUrl: 'https://github.com/firecrawl/firecrawl',
          title: 'firecrawl/firecrawl',
          publishedAt: new Date('2026-06-23T08:00:00.000Z'),
          observedAt: new Date('2026-06-23T09:00:00.000Z'),
          score: 1,
          whyImportant: ['Web data infrastructure is gaining developer attention.'],
        },
      ],
      qualityFlags: [],
    });

    expect(readerBrief.sourceMix).toEqual([
      {
        providerKey: 'github-repo-radar',
        itemCount: 2,
        citationCount: 2,
        storyClusterCount: 1,
        crossSourceClusterCount: 0,
        singleSourceOnly: true,
        topicIds: ['ai-developer-tools'],
      },
    ]);
    expect(readerBrief.qualityState).toMatchObject({
      status: 'limited_sources',
      isSingleSource: true,
      warnings: ['Source coverage is limited or single-source.'],
    });
    expect(readerBrief.bullets).toContain('1 follow-up link available in Top links.');
    expect(readerBrief.trendDelta.newSignals).toEqual(['2 Repo Radar items selected']);
    expect(readerBrief.trendDelta.newSignals.join(' ')).not.toContain('openai/codex');
    expect(readerBrief.openQuestions).toContain('Is this signal confirmed outside Repo Radar?');
    expect(readerBrief.topReads[0]).toMatchObject({
      title: 'openai/codex',
      matchedTopicIds: ['ai-developer-tools'],
      matchedRules: ['topic:ai-developer-tools', 'source-binding:binding-1', 'provider:github-repo-radar'],
      signalScore: 1,
      whyNow: 'Current briefing window has Repo Radar coverage.',
      providerMetrics: [
        { label: 'Stars', value: '54,000' },
        { label: 'Trend 24h', value: '+210 / 24h' },
        { label: 'Trend 48h', value: '+360 / 48h' },
        { label: 'Trend 7d', value: '+1200 / 7d' },
        { label: 'Trend 30d', value: '+4800 / 30d' },
        { label: 'Trend 90d', value: '+11000 / 90d' },
        { label: 'Forks', value: '2,000' },
      ],
    });
    expect(readerBrief.topReads.map((item) => item.title)).toEqual(['openai/codex', 'firecrawl/firecrawl']);
    expect(readerBrief.nextActions.map((action) => action.kind)).toEqual([
      'watch_repository',
      'watch_repository',
      'request_deeper_scan',
      'add_topic_rule',
      'mark_relevant',
      'mark_not_relevant',
    ]);
  });

  it('marks cross-source source mix when multiple providers confirm one story cluster', () => {
    const readerBrief = buildBriefingReaderBrief({
      headline: 'AI agent pain signal',
      executiveSummary: 'A GitHub repository is trending while Reddit discusses the same project pain point.',
      topStories: [
        {
          storyClusterId: 'cluster-1',
          title: 'openai/codex discussion expands',
          summary: 'GitHub growth is backed by Reddit discussion.',
          topicIds: ['ai-agents'],
          providerKeys: ['github-repo-radar', 'reddit'],
          citationIds: ['citation-1', 'citation-2'],
        },
      ],
      topicHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: 'citation-1',
          feedItemId: 'feed-github',
          sourceItemId: 'source-github',
          providerKey: 'github-repo-radar',
          field: 'title',
          canonicalUrl: 'https://github.com/openai/codex',
        },
        {
          citationId: 'citation-2',
          feedItemId: 'feed-reddit',
          sourceItemId: 'source-reddit',
          providerKey: 'reddit',
          field: 'canonicalUrl',
          canonicalUrl: 'https://github.com/openai/codex',
        },
      ],
      storyClusters: [
        {
          id: 'cluster-1',
          storyKey: 'github-repo:openai/codex',
          representativeFeedItemId: 'feed-github',
          duplicateFeedItemIds: ['feed-reddit'],
          topicIds: ['ai-agents'],
          providerKeys: ['github-repo-radar', 'reddit'],
          score: 2.4,
          observedAtRange: {
            startedAt: new Date('2026-06-23T08:00:00.000Z'),
            endedAt: new Date('2026-06-23T09:00:00.000Z'),
          },
          whyImportant: ['Cross-source confirmation appeared in the briefing window.'],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: 'feed-github',
          sourceItemId: 'source-github',
          sourceBindingId: 'binding-github',
          topicId: 'ai-agents',
          providerKey: 'github-repo-radar',
          canonicalUrl: 'https://github.com/openai/codex',
          title: 'openai/codex',
          publishedAt: new Date('2026-06-23T08:00:00.000Z'),
          observedAt: new Date('2026-06-23T09:00:00.000Z'),
          score: 2.4,
          whyImportant: ['Repository is gaining stars quickly.'],
        },
        {
          feedItemId: 'feed-reddit',
          sourceItemId: 'source-reddit',
          sourceBindingId: 'binding-reddit',
          topicId: 'ai-agents',
          providerKey: 'reddit',
          canonicalUrl: 'https://github.com/openai/codex',
          title: 'Reddit discusses openai/codex',
          publishedAt: new Date('2026-06-23T08:10:00.000Z'),
          observedAt: new Date('2026-06-23T08:20:00.000Z'),
          score: 1.4,
          whyImportant: ['Users are discussing implementation friction.'],
        },
      ],
      qualityFlags: [],
    });

    expect(readerBrief.qualityState.status).toBe('ready');
    expect(readerBrief.sourceMix).toEqual([
      {
        providerKey: 'github-repo-radar',
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        topicIds: ['ai-agents'],
      },
      {
        providerKey: 'reddit',
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        topicIds: ['ai-agents'],
      },
    ]);
    expect(readerBrief.topReads[0]?.whyNow).toBe(
      'Current briefing window has cross-source coverage from Repo Radar, Reddit and clustered 1 related item.',
    );
  });
});
