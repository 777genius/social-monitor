import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'summaries_test_fixtures.dart';

ReaderSummaryApiDto mixedSourceReaderSummaryApiDto() {
  const topReads = [
    TopReadApiDto(
      storyClusterId: 'story:agent-reliability',
      cardKind: 'curated_top_read',
      title: 'Reddit thread on agent reliability',
      providerKey: 'reddit',
      reason: 'High-engagement Reddit discussion with concrete failures.',
      matchedInterestIds: ['ai-developer-tools'],
      matchedRules: ['provider:reddit', 'interest:ai-developer-tools'],
      signalScore: 0.94,
      confirmedProviderKeys: ['reddit'],
      providerMetrics: [
        ProviderMetricApiDto(
          label: 'Reddit evidence',
          value: '1,214 score, 246 comments, 71% upvoted',
        ),
        ProviderMetricApiDto(label: 'Score', value: '1,214'),
      ],
      whyImportant: ['Shows what practitioners are struggling with.'],
      whyNow:
          'Current summary window has cross-source Reddit and GitHub coverage.',
      canonicalUrl: 'https://reddit.example/r/MachineLearning/comments/1',
      citationIds: ['editorial-reddit-1', 'editorial-reddit-2'],
    ),
    TopReadApiDto(
      storyClusterId: 'story:model-routing',
      cardKind: 'curated_top_read',
      title: 'HN discussion on model routing',
      providerKey: 'hacker-news',
      reason: 'Hacker News discussion adds technical review context.',
      matchedInterestIds: ['ai-developer-tools'],
      matchedRules: ['provider:hacker-news', 'interest:ai-developer-tools'],
      signalScore: 0.83,
      providerMetrics: [
        ProviderMetricApiDto(label: 'HN points', value: '312'),
        ProviderMetricApiDto(label: 'Comments', value: '74'),
      ],
      whyImportant: ['Adds engineering critique beyond repository metrics.'],
      whyNow: 'Current summary window includes Hacker News discussion.',
      canonicalUrl: 'https://news.ycombinator.com/item?id=1',
      citationIds: ['editorial-hacker-news-1', 'editorial-hacker-news-2'],
    ),
  ];
  return readerSummaryApiDto(
    title: 'Mixed AI source summary',
    executiveSummary:
        'Reddit, GitHub and Hacker News all contributed cited AI signals.',
    content: readerSummaryContentApiDto(
      headline: 'AI source mix',
      oneLineTakeaway:
          'The current AI signal is confirmed across discussion and repository sources.',
      qualityState: const ReaderSummaryQualityStateApiDto(
        status: 'ready',
        flags: [],
        warnings: [],
        isSingleSource: false,
      ),
      sourceMix: const [
        SourceMixEntryApiDto(
          providerKey: 'reddit',
          itemCount: 2,
          citationCount: 2,
          storyClusterCount: 2,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          interestIds: ['ai-developer-tools'],
        ),
        SourceMixEntryApiDto(
          providerKey: 'hacker-news',
          itemCount: 2,
          citationCount: 2,
          storyClusterCount: 2,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          interestIds: ['ai-developer-tools'],
        ),
      ],
      topReads: topReads,
      selectedPosts: const [],
    ),
    citations: [
      summaryCitationApiDto(
        id: 'editorial-reddit-1',
        sourceLabel: 'Reddit discussion evidence 1',
        rawSnippet: 'Practitioners compare agent reliability incidents.',
        providerKey: 'reddit',
        canonicalUrl: 'https://reddit.example/r/MachineLearning/comments/1',
      ),
      summaryCitationApiDto(
        id: 'editorial-reddit-2',
        sourceLabel: 'Reddit discussion evidence 2',
        rawSnippet: 'The discussion includes concrete reliability failures.',
        providerKey: 'reddit',
        canonicalUrl: 'https://reddit.example/r/MachineLearning/comments/1',
      ),
      summaryCitationApiDto(
        id: 'editorial-hacker-news-1',
        sourceLabel: 'Hacker News discussion evidence 1',
        rawSnippet: 'Engineers discuss model routing tradeoffs.',
        providerKey: 'hacker-news',
        canonicalUrl: 'https://news.ycombinator.com/item?id=1',
      ),
      summaryCitationApiDto(
        id: 'editorial-hacker-news-2',
        sourceLabel: 'Hacker News discussion evidence 2',
        rawSnippet: 'The discussion adds technical review context.',
        providerKey: 'hacker-news',
        canonicalUrl: 'https://news.ycombinator.com/item?id=1',
      ),
      ...canonicalGitHubTrendingCitationApiDtos(),
    ],
    coverage: const ReaderSummaryCoverageApiDto(
      collectedFeedItemCount: 469,
      selectedFeedItemCount: 68,
      topReadCount: 2,
      citationCount: 14,
      providerBreakdown: [
        ReaderSummaryProviderCoverageApiDto(
          providerKey: 'hacker-news',
          collectedFeedItemCount: 180,
          selectedFeedItemCount: 30,
          topReadCount: 1,
          citationCount: 2,
        ),
        ReaderSummaryProviderCoverageApiDto(
          providerKey: 'rss',
          collectedFeedItemCount: 175,
          selectedFeedItemCount: 0,
          topReadCount: 0,
          citationCount: 0,
        ),
        ReaderSummaryProviderCoverageApiDto(
          providerKey: 'reddit',
          collectedFeedItemCount: 92,
          selectedFeedItemCount: 28,
          topReadCount: 1,
          citationCount: 2,
        ),
        ReaderSummaryProviderCoverageApiDto(
          providerKey: githubTrendingProviderKey,
          collectedFeedItemCount: 22,
          selectedFeedItemCount: 10,
          topReadCount: 0,
          citationCount: 10,
        ),
      ],
    ),
  );
}
