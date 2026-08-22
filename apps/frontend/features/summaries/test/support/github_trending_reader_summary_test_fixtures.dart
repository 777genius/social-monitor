part of 'summaries_test_fixtures.dart';

SummaryApiDto githubTrendingSummaryApiDto() => summaryApiDto(
  title: 'GitHub Trending daily summary',
  bodyText:
      'GitHub Trending surfaced calesthio/OpenMontage, apple/container and ZhuLinsen/daily_stock_analysis from github.com/trending today. Repo Radar remains the historical growth view for 7d, 30d and 90d follow-up.',
  citations: [
    summaryCitationApiDto(
      id: 'c-1',
      sourceLabel:
          'GitHub Trending - github.com/trending page [1] calesthio/OpenMontage',
      rawSnippet: '18.4k stars, #1 today and +3.7k stars today.',
      canonicalUrl: 'https://github.com/calesthio/OpenMontage',
    ),
    summaryCitationApiDto(
      id: 'c-2',
      sourceLabel:
          'GitHub Trending - github.com/trending page [2] apple/container',
      rawSnippet: 'Apple container tooling is #2 today with +1.7k stars today.',
      canonicalUrl: 'https://github.com/apple/container',
    ),
    summaryCitationApiDto(
      id: 'c-3',
      sourceLabel:
          'GitHub Trending - github.com/trending page [3] ZhuLinsen/daily_stock_analysis',
      rawSnippet:
          'LLM-powered stock analysis is a high-rank daily GitHub Trending project.',
      canonicalUrl: 'https://github.com/ZhuLinsen/daily_stock_analysis',
    ),
  ],
);

ReaderSummaryApiDto githubTrendingReaderSummaryApiDto() {
  final selectedPosts = canonicalGitHubTrendingSelectedPostApiDtos();
  return readerSummaryApiDto(
    title: 'AI signal summary',
    executiveSummary:
        'GitHub Trending page found concrete repositories worth reviewing today, while Repo Radar should be used for longer-window GH Archive growth checks.',
    content: readerSummaryContentApiDto(
      headline: 'GitHub daily radar',
      oneLineTakeaway:
          'GitHub Trending is the daily radar for what is breaking out today; Repo Radar is the historical analytics layer for 7d, 30d and 90d growth.',
      sourceProviderKey: githubTrendingProviderKey,
      newSignals: const ['10 GitHub Trending page items selected'],
      sourceMix: const [
        SourceMixEntryApiDto(
          providerKey: githubTrendingProviderKey,
          itemCount: 10,
          citationCount: 10,
          storyClusterCount: 10,
          crossSourceClusterCount: 0,
          singleSourceOnly: true,
          interestIds: ['ai-developer-tools'],
        ),
      ],
      topReads: const [],
      selectedPosts: selectedPosts,
    ),
    topStories: const [
      SummaryStoryApiDto(
        title: 'OpenMontage leads today\'s GitHub Trending page',
        summary:
            'The daily radar is driven by the public github.com/trending page, not Repo Radar history.',
        topicCount: 10,
        providerCount: 1,
        citationIds: canonicalGitHubTrendingCitationIds,
      ),
    ],
    citations: canonicalGitHubTrendingCitationApiDtos(),
    coverage: const ReaderSummaryCoverageApiDto(
      collectedFeedItemCount: 22,
      selectedFeedItemCount: 10,
      topReadCount: 0,
      citationCount: 10,
      providerBreakdown: [
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
