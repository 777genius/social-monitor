import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'generated_summary_test_fixtures.dart';

const githubTrendingProviderKey = 'github-trending-page';

const canonicalGitHubTrendingCitationIds = [
  'bc-1',
  'bc-2',
  'bc-3',
  'bc-4',
  'bc-5',
  'bc-6',
  'bc-7',
  'bc-8',
  'bc-9',
  'bc-10',
];

const _canonicalGitHubTrendingRepositories =
    <({String repository, String stars, String starsToday})>[
      (
        repository: 'calesthio/OpenMontage',
        stars: '18,398',
        starsToday: '3,703',
      ),
      (repository: 'apple/container', stars: '41,719', starsToday: '1,746'),
      (
        repository: 'ZhuLinsen/daily_stock_analysis',
        stars: '12,640',
        starsToday: '984',
      ),
      (
        repository: 'fixture-labs/trending-repo-4',
        stars: '9,440',
        starsToday: '812',
      ),
      (
        repository: 'fixture-labs/trending-repo-5',
        stars: '8,310',
        starsToday: '744',
      ),
      (
        repository: 'fixture-labs/trending-repo-6',
        stars: '7,205',
        starsToday: '681',
      ),
      (
        repository: 'fixture-labs/trending-repo-7',
        stars: '6,180',
        starsToday: '594',
      ),
      (
        repository: 'fixture-labs/trending-repo-8',
        stars: '5,090',
        starsToday: '512',
      ),
      (
        repository: 'fixture-labs/trending-repo-9',
        stars: '4,070',
        starsToday: '436',
      ),
      (
        repository: 'fixture-labs/trending-repo-10',
        stars: '3,060',
        starsToday: '371',
      ),
    ];

List<TopReadApiDto> canonicalGitHubTrendingSelectedPostApiDtos() {
  return List<TopReadApiDto>.generate(
    _canonicalGitHubTrendingRepositories.length,
    (index) {
      final rank = index + 1;
      final repository = _canonicalGitHubTrendingRepositories[index];

      return TopReadApiDto(
        title: repository.repository,
        providerKey: githubTrendingProviderKey,
        reason: '#$rank repository on github.com/trending today.',
        matchedInterestIds: const ['ai-developer-tools'],
        matchedRules: const [
          'interest:ai-developer-tools',
          'provider:github-trending-page',
        ],
        signalScore: 1 - index / 20,
        confidence: const TopReadConfidenceApiDto(
          level: 'medium',
          score: 0.57,
          rationale: 'Daily GitHub Trending signal with raw metrics.',
        ),
        confirmedProviderKeys: const [githubTrendingProviderKey],
        providerMetrics: [
          ProviderMetricApiDto(
            label: 'GitHub Trending today',
            value: '#$rank, +${repository.starsToday} stars today',
          ),
          ProviderMetricApiDto(label: 'Stars', value: repository.stars),
        ],
        whyImportant: [
          'Repository #$rank is attracting attention on GitHub Trending.',
        ],
        whyNow: 'Current summary window includes GitHub Trending coverage.',
        canonicalUrl: 'https://github.com/${repository.repository}',
        citationIds: [canonicalGitHubTrendingCitationIds[index]],
      );
    },
    growable: false,
  );
}

List<SummaryCitationApiDto> canonicalGitHubTrendingCitationApiDtos() {
  return List<SummaryCitationApiDto>.generate(
    _canonicalGitHubTrendingRepositories.length,
    (index) {
      final rank = index + 1;
      final repository = _canonicalGitHubTrendingRepositories[index];
      final citationId = canonicalGitHubTrendingCitationIds[index];

      return summaryCitationApiDto(
        id: citationId,
        sourceLabel: 'GitHub Trending [$rank] ${repository.repository}',
        rawSnippet:
            'Repository #$rank gained ${repository.starsToday} stars today.',
        feedItemId: 'feed-$citationId',
        sourceItemId: 'source-$citationId',
        providerKey: githubTrendingProviderKey,
        canonicalUrl: 'https://github.com/${repository.repository}',
      );
    },
    growable: false,
  );
}
