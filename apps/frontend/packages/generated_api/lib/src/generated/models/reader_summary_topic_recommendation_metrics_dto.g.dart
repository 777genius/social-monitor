// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_recommendation_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicRecommendationMetricsDto
_$ReaderSummaryTopicRecommendationMetricsDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicRecommendationMetricsDto(
  averageSignalScore: json['averageSignalScore'] as num,
  citationCount: json['citationCount'] as num,
  citationRate: json['citationRate'] as num,
  collectedPostCount: json['collectedPostCount'] as num,
  crossSourceSummaryCount: json['crossSourceSummaryCount'] as num,
  duplicateEvidenceCount: json['duplicateEvidenceCount'] as num,
  duplicateRate: json['duplicateRate'] as num,
  lowRelevanceSignalCount: json['lowRelevanceSignalCount'] as num,
  mutedSignalCount: json['mutedSignalCount'] as num,
  noiseRate: json['noiseRate'] as num,
  selectedEvidenceCount: json['selectedEvidenceCount'] as num,
  selectionRate: json['selectionRate'] as num,
  summaryCount: json['summaryCount'] as num,
  topReadCount: json['topReadCount'] as num,
  topReadRate: json['topReadRate'] as num,
  usefulSummaryCount: json['usefulSummaryCount'] as num,
  userRatedSignalCount: json['userRatedSignalCount'] as num,
);

Map<String, dynamic> _$ReaderSummaryTopicRecommendationMetricsDtoToJson(
  ReaderSummaryTopicRecommendationMetricsDto instance,
) => <String, dynamic>{
  'averageSignalScore': instance.averageSignalScore,
  'citationCount': instance.citationCount,
  'citationRate': instance.citationRate,
  'collectedPostCount': instance.collectedPostCount,
  'crossSourceSummaryCount': instance.crossSourceSummaryCount,
  'duplicateEvidenceCount': instance.duplicateEvidenceCount,
  'duplicateRate': instance.duplicateRate,
  'lowRelevanceSignalCount': instance.lowRelevanceSignalCount,
  'mutedSignalCount': instance.mutedSignalCount,
  'noiseRate': instance.noiseRate,
  'selectedEvidenceCount': instance.selectedEvidenceCount,
  'selectionRate': instance.selectionRate,
  'summaryCount': instance.summaryCount,
  'topReadCount': instance.topReadCount,
  'topReadRate': instance.topReadRate,
  'usefulSummaryCount': instance.usefulSummaryCount,
  'userRatedSignalCount': instance.userRatedSignalCount,
};
