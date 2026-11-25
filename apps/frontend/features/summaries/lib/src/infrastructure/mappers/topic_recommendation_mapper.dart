import '../../domain/entities/reader_summary_topic_recommendation.dart';
import '../api/topic_recommendation_api_dto.dart';

final class TopicRecommendationMapper {
  const TopicRecommendationMapper();

  ReaderSummaryTopicRecommendationQueue toDomain(
    TopicRecommendationQueueApiDto dto,
  ) {
    return ReaderSummaryTopicRecommendationQueue(
      windowStartedAt: dto.windowStartedAt,
      windowEndedAt: dto.windowEndedAt,
      items: dto.items.map(_itemToDomain).toList(growable: false),
    );
  }

  ReaderSummaryTopicRecommendation _itemToDomain(
    TopicRecommendationApiDto dto,
  ) {
    return ReaderSummaryTopicRecommendation(
      id: dto.id,
      kind: ReaderSummaryTopicRecommendationKind.fromApiValue(dto.kind),
      decisionStatus:
          ReaderSummaryTopicRecommendationDecisionStatus.fromApiValue(
            dto.decisionStatus,
          ),
      decidedAt: dto.decidedAt,
      decidedBy: dto.decidedBy,
      decisionNote: dto.decisionNote,
      topicLabel: dto.topicLabel,
      currentTier: ReaderSummaryTopicTier.fromApiValue(dto.currentTier),
      suggestedTier: ReaderSummaryTopicTier.fromApiValue(dto.suggestedTier),
      confidenceScore: dto.confidenceScore,
      rationale: dto.rationale,
      windowDays: dto.windowDays,
      metrics: _metricsToDomain(dto.metrics),
      providerKeys: dto.providerKeys,
      interestIds: dto.interestIds,
      evidenceReaderSummaryIds: dto.evidenceReaderSummaryIds,
      reasons: dto.reasons,
    );
  }

  ReaderSummaryTopicRecommendationMetrics _metricsToDomain(
    TopicRecommendationMetricsApiDto dto,
  ) {
    return ReaderSummaryTopicRecommendationMetrics(
      collectedPostCount: dto.collectedPostCount,
      summaryCount: dto.summaryCount,
      selectedEvidenceCount: dto.selectedEvidenceCount,
      topReadCount: dto.topReadCount,
      citationCount: dto.citationCount,
      crossSourceSummaryCount: dto.crossSourceSummaryCount,
      usefulSummaryCount: dto.usefulSummaryCount,
      duplicateEvidenceCount: dto.duplicateEvidenceCount,
      lowRelevanceSignalCount: dto.lowRelevanceSignalCount,
      mutedSignalCount: dto.mutedSignalCount,
      userRatedSignalCount: dto.userRatedSignalCount,
      selectionRate: dto.selectionRate,
      citationRate: dto.citationRate,
      topReadRate: dto.topReadRate,
      duplicateRate: dto.duplicateRate,
      noiseRate: dto.noiseRate,
      averageSignalScore: dto.averageSignalScore,
    );
  }
}
