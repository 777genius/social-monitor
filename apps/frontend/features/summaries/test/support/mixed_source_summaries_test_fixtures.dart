import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'summaries_test_fixtures.dart';

ReaderSummaryApiDto mixedSourceReaderSummaryApiDto() {
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
          providerKey: 'github-trending-page',
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
      topReads: const [
        TopReadApiDto(
          title: 'Reddit thread on agent reliability',
          providerKey: 'reddit',
          reason: 'High-engagement Reddit discussion with concrete failures.',
          matchedInterestIds: ['ai-developer-tools'],
          matchedRules: ['provider:reddit', 'interest:ai-developer-tools'],
          signalScore: 0.94,
          confirmedProviderKeys: ['reddit', 'github-trending-page'],
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
          citationIds: ['bc-1', 'bc-2'],
        ),
        TopReadApiDto(
          title: 'calesthio/OpenMontage',
          providerKey: 'github-trending-page',
          reason: 'Daily GitHub Trending repository in the AI workflow space.',
          matchedInterestIds: ['ai-developer-tools'],
          matchedRules: [
            'provider:github-trending-page',
            'interest:ai-developer-tools',
          ],
          signalScore: 0.89,
          providerMetrics: [
            ProviderMetricApiDto(label: 'Stars', value: '18,398'),
            ProviderMetricApiDto(
              label: 'GitHub Trending today',
              value: '#1, +3,703 stars today',
            ),
          ],
          whyImportant: ['Shows repository attention around AI workflows.'],
          whyNow: 'Current summary window includes GitHub Trending coverage.',
          canonicalUrl: 'https://github.com/calesthio/OpenMontage',
          citationIds: ['bc-2'],
        ),
        TopReadApiDto(
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
          whyImportant: [
            'Adds engineering critique beyond repository metrics.',
          ],
          whyNow: 'Current summary window includes Hacker News discussion.',
          canonicalUrl: 'https://news.ycombinator.com/item?id=1',
          citationIds: ['bc-3'],
        ),
      ],
    ),
    citations: [
      summaryCitationApiDto(
        id: 'bc-1',
        sourceLabel: 'Reddit - r/MachineLearning',
        rawSnippet: 'Practitioners compare agent reliability incidents.',
        providerKey: 'reddit',
        canonicalUrl: 'https://reddit.example/r/MachineLearning/comments/1',
      ),
      summaryCitationApiDto(
        id: 'bc-2',
        sourceLabel: 'GitHub Trending - calesthio/OpenMontage',
        rawSnippet: 'Repository gained rapid daily attention.',
        providerKey: 'github-trending-page',
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
      ),
      summaryCitationApiDto(
        id: 'bc-3',
        sourceLabel: 'Hacker News',
        rawSnippet: 'Engineers discuss model routing tradeoffs.',
        providerKey: 'hacker-news',
        canonicalUrl: 'https://news.ycombinator.com/item?id=1',
      ),
    ],
    coverage: const ReaderSummaryCoverageApiDto(
      collectedFeedItemCount: 469,
      selectedFeedItemCount: 60,
      topReadCount: 3,
      citationCount: 6,
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
          providerKey: 'github-trending-page',
          collectedFeedItemCount: 22,
          selectedFeedItemCount: 2,
          topReadCount: 1,
          citationCount: 2,
        ),
      ],
    ),
  );
}
