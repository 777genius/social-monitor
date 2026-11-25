part of 'summaries_test_fixtures.dart';

ReaderSummaryApiDto repoRadarTopTenReaderSummaryApiDto() {
  final topReads = List<TopReadApiDto>.generate(11, (index) {
    final rank = index + 1;
    return TopReadApiDto(
      storyClusterId: 'story:repo-radar-$rank',
      cardKind: rank <= 8 ? 'curated_top_read' : 'additional_notable_story',
      title: 'repo-radar/project-$rank',
      providerKey: 'github-repo-radar',
      reason: 'Repository $rank is gaining stars in the current window.',
      matchedInterestIds: const ['ai-developer-tools'],
      matchedRules: const [
        'interest:ai-developer-tools',
        'provider:github-repo-radar',
      ],
      signalScore: 1 - index / 20,
      providerMetrics: [
        ProviderMetricApiDto(label: 'Stars', value: '${54000 - index * 100}'),
        ProviderMetricApiDto(label: 'Trend', value: '+${360 - index} / 48h'),
      ],
      whyImportant: [
        'Repository $rank is gaining stars in the current window.',
      ],
      whyNow: 'Current summary window has Repo Radar coverage.',
      canonicalUrl: 'https://github.com/repo-radar/project-$rank',
      citationIds: ['bc-$rank'],
    );
  });

  return readerSummaryApiDto(
    title: 'Repo radar top ten readerSummary',
    executiveSummary:
        'GitHub Repo Radar found ten repositories worth reviewing today.',
    storyClusterIds: [
      for (var rank = 1; rank <= 11; rank += 1) 'story:repo-radar-$rank',
    ],
    content: readerSummaryContentApiDto(
      headline: 'Repo radar top ten',
      oneLineTakeaway:
          'Review the ten strongest repository signals before drilling into the long tail.',
      topReads: topReads.take(8).toList(growable: false),
      selectedPosts: topReads.skip(8).toList(growable: false),
    ),
    citations: List<SummaryCitationApiDto>.generate(11, (index) {
      final rank = index + 1;
      return summaryCitationApiDto(
        id: 'bc-$rank',
        sourceLabel: 'Repo Radar [$rank] repo-radar/project-$rank',
        rawSnippet: 'Repository $rank is gaining stars in the current window.',
        providerKey: 'github-repo-radar',
        canonicalUrl: 'https://github.com/repo-radar/project-$rank',
      );
    }),
  );
}
