import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'generated_summary_test_fixtures.dart';
import 'github_trending_summary_test_fixtures.dart';
import 'summaries_topic_map_test_fixtures.dart';

export 'generated_summary_test_fixtures.dart';
export 'github_trending_summary_test_fixtures.dart';

const summaryWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

ReaderSummaryApiDto readerSummaryApiDto({
  String id = 'readerSummary-1',
  String title = 'AI workspace summary',
  String executiveSummary =
      'AI model launches and developer tooling changes are the strongest signals.',
  String? userId = 'user-demo',
  ReaderSummaryContentApiDto? content,
  List<SummaryStoryApiDto> topStories = const [
    SummaryStoryApiDto(
      title: 'New AI coding tools gain adoption',
      summary: 'Developers discussed new agent workflows and IDE support.',
      topicCount: 2,
      providerCount: 3,
      citationIds: ['bc-1'],
    ),
  ],
  List<RepeatedSignalApiDto> repeatedSignals = const [],
  List<SummaryCitationApiDto>? citations,
  SummaryPeriodApiDto? period,
  DateTime? generatedAt,
  SummaryWindowApiDto? sourceWindow,
  String freshnessLabel = 'Fresh',
  bool isDegraded = false,
  ReaderSummaryCoverageApiDto? coverage,
}) {
  return ReaderSummaryApiDto(
    id: id,
    title: title,
    executiveSummary: executiveSummary,
    userId: userId,
    content: content ?? readerSummaryContentApiDto(),
    topStories: topStories,
    repeatedSignals: repeatedSignals,
    citations: citations ?? [summaryCitationApiDto(id: 'bc-1')],
    period: period ?? summaryPeriodApiDto(),
    generatedAt: generatedAt ?? DateTime.utc(2026, 6, 27, 0, 15),
    sourceWindow: sourceWindow ?? summaryWindowApiDto(),
    freshnessLabel: freshnessLabel,
    isDegraded: isDegraded,
    coverage: coverage,
  );
}

SummaryPeriodApiDto summaryPeriodApiDto({
  String cadence = 'daily',
  DateTime? startedAt,
  DateTime? endedAt,
  String timezone = 'UTC',
  String? periodKey =
      'daily:2026-06-26T00:00:00.000Z:2026-06-27T00:00:00.000Z:UTC',
}) {
  return SummaryPeriodApiDto(
    cadence: cadence,
    startedAt: startedAt ?? DateTime.utc(2026, 6, 26),
    endedAt: endedAt ?? DateTime.utc(2026, 6, 27),
    timezone: timezone,
    periodKey: periodKey,
  );
}

SummaryWindowApiDto summaryWindowApiDto({
  String label = 'Evidence window',
  DateTime? startedAt,
  DateTime? endedAt,
}) {
  return SummaryWindowApiDto(
    label: label,
    startedAt: startedAt ?? DateTime.utc(2026, 6, 26, 8, 30),
    endedAt: endedAt ?? DateTime.utc(2026, 6, 26, 18, 58),
  );
}

ReaderSummary readerSummaryWithoutTopicMap(ReaderSummary summary) {
  final content = summary.content;

  return ReaderSummary(
    id: summary.id,
    title: summary.title,
    executiveSummary: summary.executiveSummary,
    userId: summary.userId,
    content: ReaderSummaryContent(
      headline: content.headline,
      oneLineTakeaway: content.oneLineTakeaway,
      bullets: content.bullets,
      narrativeSections: content.narrativeSections,
      mainTopics: content.mainTopics,
      topicMap: emptyReaderSummaryTopicMap,
      qualityState: content.qualityState,
      interestSections: content.interestSections,
      sourceMix: content.sourceMix,
      topReads: content.topReads,
      selectedPosts: content.selectedPosts,
      claimBoard: content.claimBoard,
      reliabilityReport: content.reliabilityReport,
      trendDelta: content.trendDelta,
      openQuestions: content.openQuestions,
      risks: content.risks,
      nextActions: content.nextActions,
    ),
    topStories: summary.topStories,
    repeatedSignals: summary.repeatedSignals,
    citations: summary.citations,
    period: summary.period,
    generatedAt: summary.generatedAt,
    summaryWindow: summary.summaryWindow,
    freshnessLabel: summary.freshnessLabel,
    isDegraded: summary.isDegraded,
    coverage: summary.coverage,
  );
}

ReaderSummaryContentApiDto readerSummaryContentApiDto({
  String headline = 'AI workspace summary',
  String oneLineTakeaway =
      'New AI coding tools are the clearest signal to inspect first.',
  String sourceProviderKey = 'github-repo-radar',
  List<String> mainTopics = const ['AI coding tools'],
  List<ReaderSummaryNarrativeSectionApiDto> narrativeSections = const [],
  ReaderSummaryTopicMapApiDto topicMap = sampleTopicMapApiDto,
  List<String> newSignals = const ['1 Repo Radar item selected'],
  ReaderSummaryQualityStateApiDto? qualityState,
  List<SourceMixEntryApiDto>? sourceMix,
  List<SummaryClaimApiDto> claimBoard = const [],
  SummaryReliabilityReportApiDto reliabilityReport =
      emptySummaryReliabilityReportApiDto,
  List<TopReadApiDto> topReads = const [
    TopReadApiDto(
      title: 'AI coding tools',
      providerKey: 'github-repo-radar',
      reason: 'Developers discussed new agent workflows and IDE support.',
      matchedInterestIds: ['ai-developer-tools'],
      matchedRules: [
        'interest:ai-developer-tools',
        'provider:github-repo-radar',
      ],
      signalScore: 1,
      providerMetrics: [
        ProviderMetricApiDto(label: 'Stars', value: '12,400'),
        ProviderMetricApiDto(label: 'Trend', value: '+420 / 48h'),
      ],
      whyImportant: [
        'Developers discussed new agent workflows and IDE support.',
      ],
      whyNow: 'Current summary window has Repo Radar coverage.',
      canonicalUrl: 'https://github.com/example/ai-coding-tools',
      citationIds: ['bc-1'],
    ),
  ],
  List<TopReadApiDto>? selectedPosts,
}) {
  final primaryRead = topReads.isNotEmpty ? topReads.first : null;
  final primaryTitle = primaryRead?.title ?? 'source';
  final primaryUrl = primaryRead?.canonicalUrl;
  final primaryCitationIds = primaryRead?.citationIds ?? const <String>[];

  return ReaderSummaryContentApiDto(
    headline: headline,
    oneLineTakeaway: oneLineTakeaway,
    bullets: const [
      'Best first cited read from Repo Radar (1 citation): AI coding tools - needs confirmation; verify citations in Top reads.',
    ],
    narrativeSections: narrativeSections,
    mainTopics: mainTopics,
    topicMap: topicMap,
    qualityState:
        qualityState ??
        const ReaderSummaryQualityStateApiDto(
          status: 'limited_sources',
          flags: ['limited_sources'],
          warnings: ['Source coverage is limited and needs confirmation.'],
          isSingleSource: true,
        ),
    interestSections: [
      ReaderInterestSectionApiDto(
        title: 'Developer tooling',
        insight: 'Agent workflows and IDE support are the main discussion.',
        items: topReads,
        citationIds: const ['bc-1'],
      ),
    ],
    sourceMix:
        sourceMix ??
        [
          SourceMixEntryApiDto(
            providerKey: sourceProviderKey,
            itemCount: topReads.length,
            citationCount: topReads.fold<int>(
              0,
              (count, item) => count + item.citationIds.length,
            ),
            storyClusterCount: topReads.length,
            crossSourceClusterCount: 0,
            singleSourceOnly: true,
            interestIds: const ['ai-developer-tools'],
          ),
        ],
    topReads: topReads,
    selectedPosts: selectedPosts ?? topReads,
    claimBoard: claimBoard,
    reliabilityReport: reliabilityReport,
    trendDelta: ReaderTrendDeltaApiDto(
      newSignals: newSignals,
      growingSignals: const ['Developer tooling'],
      repeatedSignals: [],
      fadingSignals: [],
    ),
    openQuestions: const [],
    risks: const [],
    nextActions: [
      ReaderActionApiDto(
        kind: 'read_source',
        label: 'Read source',
        reason: 'Open the cited source behind this summary item.',
        canonicalUrl: primaryUrl,
        citationIds: primaryCitationIds,
      ),
      ReaderActionApiDto(
        kind: 'watch_repository',
        label: 'Watch $primaryTitle',
        reason: 'Check whether the signal keeps growing.',
        canonicalUrl: primaryUrl,
        citationIds: primaryCitationIds,
      ),
      ReaderActionApiDto(
        kind: 'mark_relevant',
        label: 'Mark relevant',
        reason: 'Use feedback to keep future summaries aligned.',
        canonicalUrl: primaryUrl,
        citationIds: primaryCitationIds,
      ),
      ReaderActionApiDto(
        kind: 'mark_not_relevant',
        label: 'Not relevant',
        reason: 'Use feedback to reduce similar future signals.',
        canonicalUrl: primaryUrl,
        citationIds: primaryCitationIds,
      ),
    ],
  );
}

SummaryApiDto githubTrendingSummaryApiDto() {
  return summaryApiDto(
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
        rawSnippet:
            'Apple container tooling is #2 today with +1.7k stars today.',
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
}

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

ReaderSummaryApiDto repoRadarTopTenReaderSummaryApiDto() {
  final topReads = List<TopReadApiDto>.generate(11, (index) {
    final rank = index + 1;

    return TopReadApiDto(
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
    content: readerSummaryContentApiDto(
      headline: 'Repo radar top ten',
      oneLineTakeaway:
          'Review the ten strongest repository signals before drilling into the long tail.',
      topReads: topReads,
    ),
    citations: List<SummaryCitationApiDto>.generate(11, (index) {
      final rank = index + 1;

      return summaryCitationApiDto(
        id: 'bc-$rank',
        sourceLabel: 'Repo Radar [$rank] repo-radar/project-$rank',
        rawSnippet: 'Repository $rank is gaining stars in the current window.',
        canonicalUrl: 'https://github.com/repo-radar/project-$rank',
      );
    }),
  );
}
