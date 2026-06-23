final class SummaryCitationApiDto {
  const SummaryCitationApiDto({
    required this.id,
    required this.sourceLabel,
    required this.rawSnippet,
  });

  final String id;
  final String sourceLabel;
  final String rawSnippet;
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

final class BriefingApiDto {
  const BriefingApiDto({
    required this.id,
    required this.title,
    required this.executiveSummary,
    required this.topStories,
    required this.repeatedSignals,
    required this.citations,
    required this.freshnessLabel,
    required this.isDegraded,
  });

  final String id;
  final String title;
  final String executiveSummary;
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
