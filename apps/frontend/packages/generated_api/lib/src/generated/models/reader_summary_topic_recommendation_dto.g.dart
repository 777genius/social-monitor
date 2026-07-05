// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_recommendation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicRecommendationDto
_$ReaderSummaryTopicRecommendationDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicRecommendationDto(
  confidenceScore: json['confidenceScore'] as num,
  currentTier:
      ReaderSummaryTopicRecommendationDtoCurrentTierCurrentTier.fromJson(
        json['currentTier'] as String,
      ),
  decisionStatus:
      ReaderSummaryTopicRecommendationDtoDecisionStatusDecisionStatus.fromJson(
        json['decisionStatus'] as String,
      ),
  evidenceReaderSummaryIds: (json['evidenceReaderSummaryIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  interestIds: (json['interestIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  kind: ReaderSummaryTopicRecommendationDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  metrics: ReaderSummaryTopicRecommendationMetricsDto.fromJson(
    json['metrics'] as Map<String, dynamic>,
  ),
  providerKeys: (json['providerKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  rationale: json['rationale'] as String,
  reasons: (json['reasons'] as List<dynamic>).map((e) => e as String).toList(),
  recommendationId: json['recommendationId'] as String,
  suggestedTier:
      ReaderSummaryTopicRecommendationDtoSuggestedTierSuggestedTier.fromJson(
        json['suggestedTier'] as String,
      ),
  topicLabel: json['topicLabel'] as String,
  windowDays: json['windowDays'] as num,
  decidedAt: json['decidedAt'] == null
      ? null
      : DateTime.parse(json['decidedAt'] as String),
  decidedBy: json['decidedBy'] as String?,
  decisionNote: json['decisionNote'] as String?,
);

Map<String, dynamic> _$ReaderSummaryTopicRecommendationDtoToJson(
  ReaderSummaryTopicRecommendationDto instance,
) => <String, dynamic>{
  'confidenceScore': instance.confidenceScore,
  'currentTier': instance.currentTier,
  'decidedAt': instance.decidedAt?.toIso8601String(),
  'decidedBy': instance.decidedBy,
  'decisionNote': instance.decisionNote,
  'decisionStatus': instance.decisionStatus,
  'evidenceReaderSummaryIds': instance.evidenceReaderSummaryIds,
  'interestIds': instance.interestIds,
  'kind': instance.kind,
  'metrics': instance.metrics,
  'providerKeys': instance.providerKeys,
  'rationale': instance.rationale,
  'reasons': instance.reasons,
  'recommendationId': instance.recommendationId,
  'suggestedTier': instance.suggestedTier,
  'topicLabel': instance.topicLabel,
  'windowDays': instance.windowDays,
};
