import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'generated_summary_test_fixtures.dart';
import 'github_trending_summary_test_fixtures.dart';
import 'summaries_topic_map_test_fixtures.dart';

export 'generated_summary_test_fixtures.dart';
export 'github_trending_summary_test_fixtures.dart';

part 'repo_radar_summary_test_fixtures.dart';
part 'github_trending_reader_summary_test_fixtures.dart';

const summaryWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

ReaderPostPromotionAttestationApiDto topPromotionAttestationApiDto(
  String storyClusterId,
) => ReaderPostPromotionAttestationApiDto(
  candidateId: 'fixture:$storyClusterId',
  canonicalIdentity: storyClusterId,
  placement: 'top',
  slot: 0,
  decision: 'promote_top',
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
  List<String>? storyClusterIds,
  List<ReaderSummaryStoryClusterAuthorityApiDto>? storyClusterAuthorities,
  List<RepeatedSignalApiDto> repeatedSignals = const [],
  List<SummaryCitationApiDto>? citations,
  SummaryPeriodApiDto? period,
  DateTime? generatedAt,
  SummaryWindowApiDto? sourceWindow,
  String freshnessLabel = 'Fresh',
  bool isDegraded = false,
  ReaderSummaryCoverageApiDto? coverage,
  bool bindPromotionAttestations = true,
}) {
  final resolvedCitations =
      citations ??
      [
        summaryCitationApiDto(
          id: 'bc-1',
          feedItemId: 'feed-c-1',
          sourceItemId: 'source-c-1',
          providerKey: 'github-repo-radar',
          canonicalUrl: 'https://github.com/example/ai-coding-tools',
        ),
      ];
  final contentFixture = content ?? readerSummaryContentApiDto();
  final resolvedContent = bindPromotionAttestations
      ? _fixtureContentWithConfirmedProviders(contentFixture, resolvedCitations)
      : contentFixture;
  final inferredAuthorities = _fixtureStoryClusterAuthorities(
    resolvedContent,
    resolvedCitations,
  );
  return ReaderSummaryApiDto(
    id: id,
    title: title,
    executiveSummary: executiveSummary,
    userId: userId,
    content: resolvedContent,
    topStories: topStories,
    storyClusterIds: storyClusterIds ?? inferredAuthorities.keys.toList(),
    storyClusterAuthorities:
        storyClusterAuthorities ?? inferredAuthorities.values.toList(),
    repeatedSignals: repeatedSignals,
    citations: resolvedCitations,
    period: period ?? summaryPeriodApiDto(),
    generatedAt: generatedAt ?? DateTime.utc(2026, 6, 27, 0, 15),
    sourceWindow: sourceWindow ?? summaryWindowApiDto(),
    freshnessLabel: freshnessLabel,
    isDegraded: isDegraded,
    coverage: coverage,
  );
}

ReaderSummaryContentApiDto _fixtureContentWithConfirmedProviders(
  ReaderSummaryContentApiDto content,
  List<SummaryCitationApiDto> citations,
) {
  final citationsById = {
    for (final citation in citations) citation.id: citation,
  };
  TopReadApiDto item(
    TopReadApiDto value, {
    required String placement,
    required int slot,
  }) {
    final confirmedProviderKeys = value.citationIds
        .map((id) => citationsById[id]?.providerKey?.trim())
        .whereType<String>()
        .where((provider) => provider.isNotEmpty)
        .toSet()
        .toList();
    return TopReadApiDto(
      storyClusterId: value.storyClusterId,
      cardKind: value.cardKind,
      relationId: value.relationId,
      relationMarkerIds: value.relationMarkerIds,
      targetStoryClusterId: value.targetStoryClusterId,
      promotionAttestation: _fixtureBoundPromotionAttestation(
        value,
        placement: placement,
        slot: slot,
      ),
      title: value.title,
      providerKey: value.providerKey,
      reason: value.reason,
      citationIds: value.citationIds,
      providerName: value.providerName,
      primaryActionKind: value.primaryActionKind,
      matchedInterestIds: value.matchedInterestIds,
      matchedRules: value.matchedRules,
      signalScore: value.signalScore,
      confidence: value.confidence,
      confirmedProviderKeys: confirmedProviderKeys,
      providerMetrics: value.providerMetrics,
      whyImportant: value.whyImportant,
      whyNow: value.whyNow,
      publishedAt: value.publishedAt,
      canonicalUrl: value.canonicalUrl,
      previewMedia: value.previewMedia,
    );
  }

  return ReaderSummaryContentApiDto(
    headline: content.headline,
    oneLineTakeaway: content.oneLineTakeaway,
    bullets: content.bullets,
    narrativeSections: content.narrativeSections,
    mainTopics: content.mainTopics,
    topicMap: content.topicMap,
    qualityState: content.qualityState,
    interestSections: content.interestSections
        .map(
          (section) => ReaderInterestSectionApiDto(
            title: section.title,
            insight: section.insight,
            items: section.items
                .map((value) => item(value, placement: 'top', slot: 0))
                .toList(),
            citationIds: section.citationIds,
            interestId: section.interestId,
          ),
        )
        .toList(),
    sourceMix: content.sourceMix,
    topReads: content.topReads.indexed
        .map((entry) => item(entry.$2, placement: 'top', slot: entry.$1))
        .toList(),
    selectedPosts: content.selectedPosts.indexed
        .map((entry) => item(entry.$2, placement: 'additional', slot: entry.$1))
        .toList(),
    claimBoard: content.claimBoard,
    reliabilityReport: content.reliabilityReport,
    trendDelta: content.trendDelta,
    openQuestions: content.openQuestions,
    risks: content.risks,
    nextActions: content.nextActions,
  );
}

ReaderPostPromotionAttestationApiDto? _fixturePromotionAttestation(
  TopReadApiDto item,
) {
  final storyClusterId = item.storyClusterId?.trim();
  if (storyClusterId == null || storyClusterId.isEmpty) return null;
  final placement = switch (item.cardKind) {
    'curated_top_read' => 'top',
    'additional_notable_story' => 'additional',
    _ => null,
  };
  return placement == null
      ? null
      : ReaderPostPromotionAttestationApiDto(
          candidateId: 'fixture:$storyClusterId',
          canonicalIdentity: storyClusterId,
          placement: placement,
          slot: 0,
          decision: placement == 'top' ? 'promote_top' : 'promote_additional',
          citationIds: item.citationIds,
        );
}

ReaderPostPromotionAttestationApiDto? _fixtureBoundPromotionAttestation(
  TopReadApiDto item, {
  required String placement,
  required int slot,
}) {
  final attestation = item.promotionAttestation;
  if (attestation == null) {
    final generated = _fixturePromotionAttestation(item);
    if (generated == null) return null;
    return ReaderPostPromotionAttestationApiDto(
      candidateId: '${generated.candidateId}:$placement:$slot',
      canonicalIdentity: generated.canonicalIdentity,
      placement: placement,
      slot: slot,
      decision: placement == 'top' ? 'promote_top' : 'promote_additional',
      citationIds: generated.citationIds,
    );
  }
  return ReaderPostPromotionAttestationApiDto(
    candidateId: attestation.candidateId,
    canonicalIdentity: attestation.canonicalIdentity,
    placement: placement,
    slot: slot,
    decision: placement == 'top' ? 'promote_top' : 'promote_additional',
    citationIds: attestation.citationIds.isEmpty
        ? item.citationIds
        : attestation.citationIds,
  );
}

Map<String, ReaderSummaryStoryClusterAuthorityApiDto>
_fixtureStoryClusterAuthorities(
  ReaderSummaryContentApiDto content,
  List<SummaryCitationApiDto> citations,
) {
  final citationsById = {
    for (final citation in citations) citation.id: citation,
  };
  final feedItemIdsByCluster = <String, Set<String>>{};
  final providerKeysByCluster = <String, Set<String>>{};
  final items = [
    ...content.topReads,
    ...content.selectedPosts,
    ...content.interestSections.expand((section) => section.items),
  ];
  for (final item in items) {
    final clusterId = item.storyClusterId?.trim();
    if (clusterId == null || clusterId.isEmpty) continue;
    for (final citationId in item.citationIds) {
      final citation = citationsById[citationId];
      final providerKey = citation?.providerKey?.trim();
      if (citation == null || providerKey == null || providerKey.isEmpty) {
        continue;
      }
      feedItemIdsByCluster
          .putIfAbsent(clusterId, () => <String>{})
          .add(citation.feedItemId);
      providerKeysByCluster
          .putIfAbsent(clusterId, () => <String>{})
          .add(providerKey);
    }
  }
  return {
    for (final entry in feedItemIdsByCluster.entries)
      entry.key: ReaderSummaryStoryClusterAuthorityApiDto(
        id: entry.key,
        feedItemIds: entry.value.toList(),
        providerKeys: providerKeysByCluster[entry.key]!.toList(),
      ),
  };
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
  List<ReaderInterestSectionApiDto>? interestSections,
  List<SummaryClaimApiDto> claimBoard = const [],
  SummaryReliabilityReportApiDto reliabilityReport =
      emptySummaryReliabilityReportApiDto,
  List<TopReadApiDto> topReads = const [
    TopReadApiDto(
      storyClusterId: 'story:ai-coding-tools',
      cardKind: 'curated_top_read',
      promotionAttestation: ReaderPostPromotionAttestationApiDto(
        candidateId: 'feed-c-1',
        canonicalIdentity: 'url:https://github.com/example/ai-coding-tools',
        placement: 'top',
        slot: 0,
        decision: 'promote_top',
        citationIds: ['bc-1'],
      ),
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
    interestSections:
        interestSections ??
        [
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
    selectedPosts: selectedPosts ?? const [],
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
