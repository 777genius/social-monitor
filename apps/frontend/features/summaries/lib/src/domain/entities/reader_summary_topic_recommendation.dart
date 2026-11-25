final class ReaderSummaryTopicRecommendationQueue {
  const ReaderSummaryTopicRecommendationQueue({
    required this.windowStartedAt,
    required this.windowEndedAt,
    required this.items,
  });

  final DateTime windowStartedAt;
  final DateTime windowEndedAt;
  final List<ReaderSummaryTopicRecommendation> items;

  bool get isEmpty => items.isEmpty;
}

final class ReaderSummaryTopicRecommendation {
  const ReaderSummaryTopicRecommendation({
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
  final ReaderSummaryTopicRecommendationKind kind;
  final ReaderSummaryTopicRecommendationDecisionStatus decisionStatus;
  final DateTime? decidedAt;
  final String? decidedBy;
  final String? decisionNote;
  final String topicLabel;
  final ReaderSummaryTopicTier currentTier;
  final ReaderSummaryTopicTier suggestedTier;
  final double confidenceScore;
  final String rationale;
  final int windowDays;
  final ReaderSummaryTopicRecommendationMetrics metrics;
  final List<String> providerKeys;
  final List<String> interestIds;
  final List<String> evidenceReaderSummaryIds;
  final List<String> reasons;

  bool get promotesToCore =>
      kind == ReaderSummaryTopicRecommendationKind.promoteAdjacentTopic &&
      suggestedTier == ReaderSummaryTopicTier.core;
}

final class ReaderSummaryTopicRecommendationMetrics {
  const ReaderSummaryTopicRecommendationMetrics({
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

enum ReaderSummaryTopicRecommendationKind {
  promoteAdjacentTopic,
  observeAdjacentTopic,
  unknown;

  static ReaderSummaryTopicRecommendationKind fromApiValue(String value) {
    return switch (value) {
      'promote_adjacent_topic' => promoteAdjacentTopic,
      'observe_adjacent_topic' => observeAdjacentTopic,
      _ => unknown,
    };
  }
}

enum ReaderSummaryTopicRecommendationDecisionStatus {
  pending,
  accepted,
  rejected,
  unknown;

  static ReaderSummaryTopicRecommendationDecisionStatus fromApiValue(
    String value,
  ) {
    return switch (value) {
      'pending' => pending,
      'accepted' => accepted,
      'rejected' => rejected,
      _ => unknown,
    };
  }
}

enum ReaderSummaryTopicTier {
  core,
  adjacent,
  unknown;

  static ReaderSummaryTopicTier fromApiValue(String value) {
    return switch (value) {
      'core' => core,
      'adjacent' => adjacent,
      _ => unknown,
    };
  }
}
