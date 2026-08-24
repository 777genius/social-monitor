import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import 'summaries_test_fixtures.dart';

TopRead topPostFixture({
  required String title,
  String? storyClusterId,
  ReaderSummaryCardKind cardKind = ReaderSummaryCardKind.unsupported,
  String providerKey = 'reddit',
  String? canonicalUrl,
  int? githubRank,
  List<ProviderMetric>? providerMetrics,
  List<String> citationIds = const [],
  double signalScore = 1,
  String confidenceLevel = 'medium',
  double confidenceScore = 0.6,
  List<String> matchedInterestIds = const ['ai-developer-tools'],
  List<String>? confirmedProviderKeys,
  bool attested = true,
  String? promotionCanonicalIdentity,
  ReaderPostPromotionAttestation? promotionAttestationOverride,
}) {
  final defaultPromotionAttestation = switch (cardKind) {
    ReaderSummaryCardKind.curatedTopRead when attested =>
      ReaderPostPromotionAttestation(
        candidateId: 'candidate:${storyClusterId ?? title}',
        canonicalIdentity:
            promotionCanonicalIdentity ?? 'story:${storyClusterId ?? title}',
        placement: ReaderPostPromotionPlacement.top,
        slot: 0,
        decision: 'promote_top',
      ),
    ReaderSummaryCardKind.additionalNotableStory when attested =>
      ReaderPostPromotionAttestation(
        candidateId: 'candidate:${storyClusterId ?? title}',
        canonicalIdentity:
            promotionCanonicalIdentity ?? 'story:${storyClusterId ?? title}',
        placement: ReaderPostPromotionPlacement.additional,
        slot: 0,
        decision: 'promote_additional',
      ),
    _ => null,
  };
  final promotionAttestation =
      promotionAttestationOverride ?? defaultPromotionAttestation;
  return TopRead(
    storyClusterId: storyClusterId,
    cardKind: cardKind,
    promotionAttestation: promotionAttestation,
    title: title,
    providerKey: providerKey,
    reason: '$title is relevant evidence.',
    matchedInterestIds: matchedInterestIds,
    matchedRules: const [],
    signalScore: SignalScore.normalized(signalScore),
    confidence: TopReadConfidence(
      level: confidenceLevel,
      score: confidenceScore,
      rationale: 'Test evidence.',
    ),
    confirmedProviderKeys: confirmedProviderKeys ?? [providerKey],
    providerMetrics:
        providerMetrics ??
        [
          if (providerKey.trim().toLowerCase() == 'reddit')
            const ProviderMetric(label: 'Score', value: '25'),
          if (githubRank != null)
            ProviderMetric(
              label: 'GitHub Trending today',
              value: '#$githubRank, +100 stars today',
            ),
        ],
    whyImportant: const [],
    whyNow: 'Current test window.',
    citationIds: citationIds,
    canonicalUrl: canonicalUrl,
  );
}

ReaderSummary topPostsSummaryFixture({
  required List<TopRead> topReads,
  List<TopRead> selectedPosts = const [],
  List<SummaryStory>? topStories,
  List<SummaryCitation>? citations,
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
    topStories: topStories ?? base.topStories,
    repeatedSignals: base.repeatedSignals,
    citations: citations ?? base.citations,
    period: period ?? base.period,
    generatedAt: base.generatedAt,
    summaryWindow: base.summaryWindow,
    freshnessLabel: base.freshnessLabel,
    isDegraded: base.isDegraded,
    coverage: base.coverage,
  );
}
