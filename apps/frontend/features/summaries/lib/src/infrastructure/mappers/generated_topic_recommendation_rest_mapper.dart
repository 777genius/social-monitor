import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/topic_recommendation_api_dto.dart';

final class GeneratedTopicRecommendationRestMapper {
  const GeneratedTopicRecommendationRestMapper();

  TopicRecommendationQueueApiDto map(
    generated.ListReaderSummaryTopicRecommendationsResponseDto dto,
  ) {
    return TopicRecommendationQueueApiDto(
      windowStartedAt: dto.windowStartedAt,
      windowEndedAt: dto.windowEndedAt,
      items: dto.items.map(_item).toList(growable: false),
    );
  }

  TopicRecommendationApiDto _item(
    generated.ReaderSummaryTopicRecommendationDto dto,
  ) {
    return TopicRecommendationApiDto(
      id: dto.recommendationId,
      kind: dto.kind.json ?? 'unknown',
      decisionStatus: dto.decisionStatus.json ?? 'pending',
      decidedAt: dto.decidedAt,
      decidedBy: dto.decidedBy,
      decisionNote: dto.decisionNote,
      topicLabel: dto.topicLabel,
      currentTier: dto.currentTier.json ?? 'unknown',
      suggestedTier: dto.suggestedTier.json ?? 'unknown',
      confidenceScore: dto.confidenceScore.toDouble(),
      rationale: dto.rationale,
      windowDays: dto.windowDays.toInt(),
      metrics: _metrics(dto.metrics),
      providerKeys: dto.providerKeys,
      interestIds: dto.interestIds,
      evidenceReaderSummaryIds: dto.evidenceReaderSummaryIds,
      reasons: dto.reasons,
    );
  }

  TopicRecommendationMetricsApiDto _metrics(
    generated.ReaderSummaryTopicRecommendationMetricsDto dto,
  ) {
    return TopicRecommendationMetricsApiDto(
      collectedPostCount: dto.collectedPostCount.toInt(),
      summaryCount: dto.summaryCount.toInt(),
      selectedEvidenceCount: dto.selectedEvidenceCount.toInt(),
      topReadCount: dto.topReadCount.toInt(),
      citationCount: dto.citationCount.toInt(),
      crossSourceSummaryCount: dto.crossSourceSummaryCount.toInt(),
      usefulSummaryCount: dto.usefulSummaryCount.toInt(),
      duplicateEvidenceCount: dto.duplicateEvidenceCount.toInt(),
      lowRelevanceSignalCount: dto.lowRelevanceSignalCount.toInt(),
      mutedSignalCount: dto.mutedSignalCount.toInt(),
      userRatedSignalCount: dto.userRatedSignalCount.toInt(),
      selectionRate: dto.selectionRate.toDouble(),
      citationRate: dto.citationRate.toDouble(),
      topReadRate: dto.topReadRate.toDouble(),
      duplicateRate: dto.duplicateRate.toDouble(),
      noiseRate: dto.noiseRate.toDouble(),
      averageSignalScore: dto.averageSignalScore.toDouble(),
    );
  }

  TopicRecommendationDecisionApiDto mapDecision(
    generated.DecideReaderSummaryTopicRecommendationResponseDto dto,
  ) {
    final decision = dto.decision;

    return TopicRecommendationDecisionApiDto(
      recommendationId: decision?.recommendationId ?? '',
      topicLabel: decision?.topicLabel ?? '',
      status: dto.decisionStatus.json ?? decision?.status.json ?? 'pending',
      decidedBy: decision?.decidedBy,
      note: decision?.note,
      decidedAt: decision?.decidedAt,
    );
  }
}
