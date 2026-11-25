final class TopicRecommendationQueueApiDto {
  const TopicRecommendationQueueApiDto({
    required this.windowStartedAt,
    required this.windowEndedAt,
    required this.items,
  });

  final DateTime windowStartedAt;
  final DateTime windowEndedAt;
  final List<TopicRecommendationApiDto> items;
}

final class TopicRecommendationApiDto {
  const TopicRecommendationApiDto({
    required this.id,
    required this.kind,
    required this.decisionStatus,
    this.decidedAt,
    this.decidedBy,
    this.decisionNote,
    required this.topicLabel,
    required this.currentTier,
    required this.suggestedTier,
    required this.confidenceScore,
    required this.rationale,
    required this.windowDays,
    required this.metrics,
    required this.providerKeys,
    required this.interestIds,
    required this.evidenceReaderSummaryIds,
    required this.reasons,
  });

  final String id;
  final String kind;
  final String decisionStatus;
  final DateTime? decidedAt;
  final String? decidedBy;
  final String? decisionNote;
  final String topicLabel;
  final String currentTier;
  final String suggestedTier;
  final double confidenceScore;
  final String rationale;
  final int windowDays;
  final TopicRecommendationMetricsApiDto metrics;
  final List<String> providerKeys;
  final List<String> interestIds;
  final List<String> evidenceReaderSummaryIds;
  final List<String> reasons;
}

final class TopicRecommendationMetricsApiDto {
  const TopicRecommendationMetricsApiDto({
    required this.collectedPostCount,
    required this.summaryCount,
    required this.selectedEvidenceCount,
    required this.topReadCount,
    required this.citationCount,
    required this.crossSourceSummaryCount,
    required this.usefulSummaryCount,
    required this.duplicateEvidenceCount,
    required this.lowRelevanceSignalCount,
    required this.mutedSignalCount,
    required this.userRatedSignalCount,
    required this.selectionRate,
    required this.citationRate,
    required this.topReadRate,
    required this.duplicateRate,
    required this.noiseRate,
    required this.averageSignalScore,
  });

  final int collectedPostCount;
  final int summaryCount;
  final int selectedEvidenceCount;
  final int topReadCount;
  final int citationCount;
  final int crossSourceSummaryCount;
  final int usefulSummaryCount;
  final int duplicateEvidenceCount;
  final int lowRelevanceSignalCount;
  final int mutedSignalCount;
  final int userRatedSignalCount;
  final double selectionRate;
  final double citationRate;
  final double topReadRate;
  final double duplicateRate;
  final double noiseRate;
  final double averageSignalScore;
}

final class TopicRecommendationDecisionApiDto {
  const TopicRecommendationDecisionApiDto({
    required this.recommendationId,
    required this.topicLabel,
    required this.status,
    this.decidedBy,
    this.note,
    this.decidedAt,
  });

  final String recommendationId;
  final String topicLabel;
  final String status;
  final String? decidedBy;
  final String? note;
  final DateTime? decidedAt;
}
