final class SummaryCitationApiDto {
  const SummaryCitationApiDto({
    required this.id,
    required this.sourceLabel,
    required this.rawSnippet,
    this.canonicalUrl,
  });

  final String id;
  final String sourceLabel;
  final String rawSnippet;
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
    required this.citationIds,
  });

  final String title;
  final String summary;
  final int topicCount;
  final int providerCount;
  final List<String> citationIds;
}

final class RepeatedSignalApiDto {
  const RepeatedSignalApiDto({
    required this.title,
    required this.topicIds,
    required this.citationIds,
  });

  final String title;
  final List<String> topicIds;
  final List<String> citationIds;
}

final class TopReadApiDto {
  const TopReadApiDto({
    required this.title,
    required this.providerKey,
    required this.reason,
    required this.citationIds,
    this.providerName,
    this.primaryActionKind = 'read_source',
    this.matchedTopicIds = const [],
    this.matchedRules = const [],
    this.signalScore = 0,
    this.confidence = const TopReadConfidenceApiDto(
      level: 'low',
      score: 0.35,
      rationale: 'Single-source story signal.',
    ),
    this.confirmedProviderKeys = const [],
    this.providerMetrics = const [],
    this.whyImportant = const [],
    this.whyNow = 'Selected in the current summary window',
    this.canonicalUrl,
  });

  final String title;
  final String providerKey;
  final String? providerName;
  final String primaryActionKind;
  final String reason;
  final List<String> matchedTopicIds;
  final List<String> matchedRules;
  final double signalScore;
  final TopReadConfidenceApiDto confidence;
  final List<String> confirmedProviderKeys;
  final List<ProviderMetricApiDto> providerMetrics;
  final List<String> whyImportant;
  final String whyNow;
  final List<String> citationIds;
  final String? canonicalUrl;
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

final class ReaderTopicSectionApiDto {
  const ReaderTopicSectionApiDto({
    required this.title,
    required this.insight,
    required this.items,
    required this.citationIds,
    this.topicId,
  });

  final String title;
  final String insight;
  final List<TopReadApiDto> items;
  final List<String> citationIds;
  final String? topicId;
}

final class SourceMixEntryApiDto {
  const SourceMixEntryApiDto({
    required this.providerKey,
    required this.itemCount,
    required this.citationCount,
    this.storyClusterCount = 0,
    this.crossSourceClusterCount = 0,
    this.singleSourceOnly = true,
    this.topicIds = const [],
  });

  final String providerKey;
  final int itemCount;
  final int citationCount;
  final int storyClusterCount;
  final int crossSourceClusterCount;
  final bool singleSourceOnly;
  final List<String> topicIds;
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

final class ReaderSummaryContentApiDto {
  const ReaderSummaryContentApiDto({
    required this.headline,
    required this.oneLineTakeaway,
    required this.bullets,
    required this.topicSections,
    required this.sourceMix,
    required this.topReads,
    required this.trendDelta,
    required this.openQuestions,
    required this.risks,
    required this.nextActions,
    this.qualityState = const ReaderSummaryQualityStateApiDto(
      status: 'ready',
      flags: [],
      warnings: [],
      isSingleSource: false,
    ),
  });

  final String headline;
  final String oneLineTakeaway;
  final List<String> bullets;
  final ReaderSummaryQualityStateApiDto qualityState;
  final List<ReaderTopicSectionApiDto> topicSections;
  final List<SourceMixEntryApiDto> sourceMix;
  final List<TopReadApiDto> topReads;
  final ReaderTrendDeltaApiDto trendDelta;
  final List<String> openQuestions;
  final List<String> risks;
  final List<ReaderActionApiDto> nextActions;
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

final class ReaderSummaryApiDto {
  const ReaderSummaryApiDto({
    required this.id,
    required this.title,
    required this.executiveSummary,
    required this.userId,
    required this.content,
    required this.topStories,
    required this.repeatedSignals,
    required this.citations,
    required this.period,
    required this.freshnessLabel,
    required this.isDegraded,
  });

  final String id;
  final String title;
  final String executiveSummary;
  final String? userId;
  final ReaderSummaryContentApiDto content;
  final List<SummaryStoryApiDto> topStories;
  final List<RepeatedSignalApiDto> repeatedSignals;
  final List<SummaryCitationApiDto> citations;
  final SummaryPeriodApiDto period;
  final String freshnessLabel;
  final bool isDegraded;
}

final class WorkspaceSummaryApiDto {
  const WorkspaceSummaryApiDto({this.current});

  final ReaderSummaryApiDto? current;
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
