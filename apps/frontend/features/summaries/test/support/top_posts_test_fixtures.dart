import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import 'summaries_test_fixtures.dart';

TopRead topPostFixture({
  required String title,
  String providerKey = 'reddit',
  String? canonicalUrl,
  int? githubRank,
  List<ProviderMetric>? providerMetrics,
}) {
  return TopRead(
    title: title,
    providerKey: providerKey,
    reason: '$title is relevant evidence.',
    matchedInterestIds: const ['ai-developer-tools'],
    matchedRules: const [],
    signalScore: SignalScore.normalized(1),
    confidence: const TopReadConfidence(
      level: 'medium',
      score: 0.6,
      rationale: 'Test evidence.',
    ),
    confirmedProviderKeys: [providerKey],
    providerMetrics:
        providerMetrics ??
        [
          if (githubRank != null)
            ProviderMetric(
              label: 'GitHub Trending today',
              value: '#$githubRank, +100 stars today',
            ),
        ],
    whyImportant: const [],
    whyNow: 'Current test window.',
    citationIds: const [],
    canonicalUrl: canonicalUrl,
  );
}

ReaderSummary topPostsSummaryFixture({
  required List<TopRead> topReads,
  List<TopRead> selectedPosts = const [],
  SummaryPeriod? period,
}) {
  final base = const SummaryMapper().readerSummaryToDomain(
    readerSummaryApiDto(),
  );
  final content = base.content;
  return ReaderSummary(
    id: base.id,
    title: base.title,
    executiveSummary: base.executiveSummary,
    userId: base.userId,
    content: ReaderSummaryContent(
      headline: content.headline,
      oneLineTakeaway: content.oneLineTakeaway,
      bullets: content.bullets,
      narrativeSections: content.narrativeSections,
      mainTopics: content.mainTopics,
      topicMap: content.topicMap,
      qualityState: content.qualityState,
      interestSections: content.interestSections,
      sourceMix: content.sourceMix,
      topReads: topReads,
      selectedPosts: selectedPosts,
      claimBoard: content.claimBoard,
      reliabilityReport: content.reliabilityReport,
      trendDelta: content.trendDelta,
      openQuestions: content.openQuestions,
      risks: content.risks,
      nextActions: content.nextActions,
    ),
    topStories: base.topStories,
    repeatedSignals: base.repeatedSignals,
    citations: base.citations,
    period: period ?? base.period,
    summaryWindow: base.summaryWindow,
    freshnessLabel: base.freshnessLabel,
    isDegraded: base.isDegraded,
    coverage: base.coverage,
  );
}
