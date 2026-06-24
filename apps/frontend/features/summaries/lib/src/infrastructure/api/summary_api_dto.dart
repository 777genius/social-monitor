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

final class BriefingStoryApiDto {
  const BriefingStoryApiDto({
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

final class BriefingRepeatedSignalApiDto {
  const BriefingRepeatedSignalApiDto({
    required this.title,
    required this.topicIds,
    required this.citationIds,
  });

  final String title;
  final List<String> topicIds;
  final List<String> citationIds;
}

final class BriefingReaderItemApiDto {
  const BriefingReaderItemApiDto({
    required this.title,
    required this.providerKey,
    required this.reason,
    required this.citationIds,
    this.matchedTopicIds = const [],
    this.matchedRules = const [],
    this.signalScore = 0,
    this.providerMetrics = const [],
    this.whyImportant = const [],
    this.whyNow = 'Selected in the current summary window',
    this.canonicalUrl,
  });

  final String title;
  final String providerKey;
  final String reason;
  final List<String> matchedTopicIds;
  final List<String> matchedRules;
  final double signalScore;
  final List<BriefingProviderMetricApiDto> providerMetrics;
  final List<String> whyImportant;
  final String whyNow;
  final List<String> citationIds;
  final String? canonicalUrl;
}

final class BriefingProviderMetricApiDto {
  const BriefingProviderMetricApiDto({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;
}

final class BriefingTopicSectionApiDto {
  const BriefingTopicSectionApiDto({
    required this.title,
    required this.insight,
    required this.items,
    required this.citationIds,
    this.topicId,
  });

  final String title;
  final String insight;
  final List<BriefingReaderItemApiDto> items;
  final List<String> citationIds;
  final String? topicId;
}

final class BriefingSourceMixEntryApiDto {
  const BriefingSourceMixEntryApiDto({
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

final class BriefingReaderQualityStateApiDto {
  const BriefingReaderQualityStateApiDto({
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

final class BriefingTrendDeltaApiDto {
  const BriefingTrendDeltaApiDto({
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

final class BriefingNextActionApiDto {
  const BriefingNextActionApiDto({
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

final class BriefingReaderBriefApiDto {
  const BriefingReaderBriefApiDto({
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
    this.qualityState = const BriefingReaderQualityStateApiDto(
      status: 'ready',
      flags: [],
      warnings: [],
      isSingleSource: false,
    ),
  });

  final String headline;
  final String oneLineTakeaway;
  final List<String> bullets;
  final BriefingReaderQualityStateApiDto qualityState;
  final List<BriefingTopicSectionApiDto> topicSections;
  final List<BriefingSourceMixEntryApiDto> sourceMix;
  final List<BriefingReaderItemApiDto> topReads;
  final BriefingTrendDeltaApiDto trendDelta;
  final List<String> openQuestions;
  final List<String> risks;
  final List<BriefingNextActionApiDto> nextActions;
}

final class BriefingApiDto {
  const BriefingApiDto({
    required this.id,
    required this.title,
    required this.executiveSummary,
    required this.userId,
    required this.readerBrief,
    required this.topStories,
    required this.repeatedSignals,
    required this.citations,
    required this.freshnessLabel,
    required this.isDegraded,
  });

  final String id;
  final String title;
  final String executiveSummary;
  final String? userId;
  final BriefingReaderBriefApiDto readerBrief;
  final List<BriefingStoryApiDto> topStories;
  final List<BriefingRepeatedSignalApiDto> repeatedSignals;
  final List<SummaryCitationApiDto> citations;
  final String freshnessLabel;
  final bool isDegraded;
}

final class WorkspaceBriefingApiDto {
  const WorkspaceBriefingApiDto({this.current});

  final BriefingApiDto? current;
}

final class BriefingJobApiDto {
  const BriefingJobApiDto({
    required this.id,
    required this.status,
    this.created = false,
    this.briefingId,
    this.failureReason,
    this.requestedAt,
    this.startedAt,
    this.completedAt,
    this.failedAt,
  });

  final String id;
  final String status;
  final bool created;
  final String? briefingId;
  final String? failureReason;
  final DateTime? requestedAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? failedAt;
}
