part 'summary_reader_quality_api_dto.dart';
part 'reader_summary_content_api_dto.dart';
part 'reader_summary_coverage_api_dto.dart';
part 'workspace_summary_api_dto.dart';

final class SummaryCitationApiDto {
  const SummaryCitationApiDto({
    required this.id,
    required this.sourceLabel,
    required this.rawSnippet,
    required this.feedItemId,
    required this.sourceItemId,
    this.providerKey,
    this.canonicalUrl,
  });

  final String id;
  final String sourceLabel;
  final String rawSnippet;
  final String feedItemId;
  final String sourceItemId;
  final String? providerKey;
  final String? canonicalUrl;
}

final class SummaryApiDto {
  const SummaryApiDto({
    required this.id,
    required this.title,
    required this.status,
    required this.bodyText,
    required this.citations,
    required this.freshnessLabel,
    required this.feedbackSubmitted,
  });

  final String id;
  final String title;
  final String status;
  final String bodyText;
  final List<SummaryCitationApiDto> citations;
  final String freshnessLabel;
  final bool feedbackSubmitted;
}

final class SummaryPageApiDto {
  const SummaryPageApiDto({required this.items, this.nextCursor});

  final List<SummaryApiDto> items;
  final String? nextCursor;
}

final class SummaryStoryApiDto {
  const SummaryStoryApiDto({
    required this.title,
    required this.summary,
    required this.topicCount,
    required this.providerCount,
    this.citationIds = const [],
    this.storyClusterId,
    this.interestIds = const [],
    this.providerKeys = const [],
  });

  final String? storyClusterId;
  final String title;
  final String summary;
  final int topicCount;
  final int providerCount;
  final List<String> interestIds;
  final List<String> providerKeys;
  final List<String> citationIds;
}

final class RepeatedSignalApiDto {
  const RepeatedSignalApiDto({
    required this.title,
    required this.interestIds,
    this.citationIds = const [],
  });

  final String title;
  final List<String> interestIds;
  final List<String> citationIds;
}

final class TopReadApiDto {
  const TopReadApiDto({
    this.storyClusterId,
    this.cardKind,
    this.relationId,
    this.relationMarkerIds = const [],
    this.targetStoryClusterId,
    this.promotionAttestation,
    required this.title,
    required this.providerKey,
    required this.reason,
    required this.citationIds,
    this.providerName,
    this.primaryActionKind = 'read_source',
    this.matchedInterestIds = const [],
    this.matchedRules = const [],
    this.signalScore = 0,
    this.confidence = const TopReadConfidenceApiDto(
      level: 'low',
      score: 0.35,
      rationale:
          'This story has not been independently confirmed across monitored source groups yet.',
    ),
    this.confirmedProviderKeys = const [],
    this.providerMetrics = const [],
    this.whyImportant = const [],
    this.whyNow = 'Selected in the current summary window',
    this.publishedAt,
    this.canonicalUrl,
    this.previewMedia,
  });

  final String? storyClusterId;
  final String? cardKind;
  final String? relationId;
  final List<String> relationMarkerIds;
  final String? targetStoryClusterId;
  final ReaderPostPromotionAttestationApiDto? promotionAttestation;
  final String title;
  final String providerKey;
  final String? providerName;
  final String primaryActionKind;
  final String reason;
  final List<String> matchedInterestIds;
  final List<String> matchedRules;
  final double signalScore;
  final TopReadConfidenceApiDto confidence;
  final List<String> confirmedProviderKeys;
  final List<ProviderMetricApiDto> providerMetrics;
  final List<String> whyImportant;
  final String whyNow;
  final DateTime? publishedAt;
  final List<String> citationIds;
  final String? canonicalUrl;
  final PreviewMediaApiDto? previewMedia;
}

final class ReaderPostPromotionAttestationApiDto {
  const ReaderPostPromotionAttestationApiDto({
    required this.candidateId,
    required this.canonicalIdentity,
    required this.placement,
    required this.slot,
    required this.decision,
    this.citationIds = const [],
  });

  final String candidateId;
  final String canonicalIdentity;
  final String placement;
  final int slot;
  final String decision;
  final List<String> citationIds;
}

final class PreviewMediaApiDto {
  const PreviewMediaApiDto({
    required this.kind,
    required this.url,
    this.sourceUrl,
    this.altText,
  });

  final String kind;
  final String url;
  final String? sourceUrl;
  final String? altText;
}

final class TopReadConfidenceApiDto {
  const TopReadConfidenceApiDto({
    required this.level,
    required this.score,
    required this.rationale,
  });

  final String level;
  final double score;
  final String rationale;
}

final class ProviderMetricApiDto {
  const ProviderMetricApiDto({required this.label, required this.value});

  final String label;
  final String value;
}

final class ReaderInterestSectionApiDto {
  const ReaderInterestSectionApiDto({
    required this.title,
    required this.insight,
    required this.items,
    required this.citationIds,
    this.interestId,
  });

  final String title;
  final String insight;
  final List<TopReadApiDto> items;
  final List<String> citationIds;
  final String? interestId;
}

final class SourceMixEntryApiDto {
  const SourceMixEntryApiDto({
    required this.providerKey,
    required this.itemCount,
    required this.citationCount,
    this.storyClusterCount = 0,
    this.crossSourceClusterCount = 0,
    this.singleSourceOnly = true,
    this.interestIds = const [],
  });

  final String providerKey;
  final int itemCount;
  final int citationCount;
  final int storyClusterCount;
  final int crossSourceClusterCount;
  final bool singleSourceOnly;
  final List<String> interestIds;
}

final class ReaderSummaryQualityStateApiDto {
  const ReaderSummaryQualityStateApiDto({
    required this.status,
    required this.flags,
    required this.warnings,
    required this.isSingleSource,
  });

  final String status;
  final List<String> flags;
  final List<String> warnings;
  final bool isSingleSource;
}

final class ReaderTrendDeltaApiDto {
  const ReaderTrendDeltaApiDto({
    required this.newSignals,
    required this.growingSignals,
    required this.repeatedSignals,
    required this.fadingSignals,
  });

  final List<String> newSignals;
  final List<String> growingSignals;
  final List<String> repeatedSignals;
  final List<String> fadingSignals;
}

final class ReaderActionApiDto {
  const ReaderActionApiDto({
    required this.kind,
    required this.label,
    required this.reason,
    required this.citationIds,
    this.canonicalUrl,
  });

  final String kind;
  final String label;
  final String reason;
  final List<String> citationIds;
  final String? canonicalUrl;
}

final class SummaryPeriodApiDto {
  const SummaryPeriodApiDto({
    required this.cadence,
    required this.startedAt,
    required this.endedAt,
    required this.timezone,
    this.periodKey,
  });

  final String cadence;
  final DateTime startedAt;
  final DateTime endedAt;
  final String timezone;
  final String? periodKey;
}

final class SummaryWindowApiDto {
  const SummaryWindowApiDto({
    this.id,
    required this.label,
    required this.startedAt,
    required this.endedAt,
    this.ingestionCutoff,
  });

  final String? id;
  final String label;
  final DateTime startedAt;
  final DateTime endedAt;
  final DateTime? ingestionCutoff;
}

final class ReaderSummaryApiDto {
  const ReaderSummaryApiDto({
    required this.id,
    required this.title,
    required this.executiveSummary,
    required this.userId,
    required this.content,
    required this.topStories,
    this.storyClusterIds = const [],
    this.storyClusterAuthorities = const [],
    required this.repeatedSignals,
    required this.citations,
    required this.period,
    this.generatedAt,
    required this.sourceWindow,
    required this.freshnessLabel,
    required this.isDegraded,
    this.coverage,
  });

  final String id;
  final String title;
  final String executiveSummary;
  final String? userId;
  final ReaderSummaryContentApiDto content;
  final List<SummaryStoryApiDto> topStories;
  final List<String> storyClusterIds;
  final List<ReaderSummaryStoryClusterAuthorityApiDto> storyClusterAuthorities;
  final List<RepeatedSignalApiDto> repeatedSignals;
  final List<SummaryCitationApiDto> citations;
  final SummaryPeriodApiDto period;
  final DateTime? generatedAt;
  final SummaryWindowApiDto sourceWindow;
  final String freshnessLabel;
  final bool isDegraded;
  final ReaderSummaryCoverageApiDto? coverage;
}

final class ReaderSummaryStoryClusterAuthorityApiDto {
  const ReaderSummaryStoryClusterAuthorityApiDto({
    required this.id,
    required this.feedItemIds,
    required this.providerKeys,
  });

  final String id;
  final List<String> feedItemIds;
  final List<String> providerKeys;
}

final class ReaderSummaryJobApiDto {
  const ReaderSummaryJobApiDto({
    required this.id,
    required this.status,
    this.created = false,
    this.summaryId,
    this.failureReason,
    this.requestedAt,
    this.startedAt,
    this.completedAt,
    this.failedAt,
    this.period,
  });

  final String id;
  final String status;
  final bool created;
  final String? summaryId;
  final String? failureReason;
  final DateTime? requestedAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? failedAt;
  final SummaryPeriodApiDto? period;
}
