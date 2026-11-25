// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_topic_recommendation_metrics_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicRecommendationMetricsDto {
  const ReaderSummaryTopicRecommendationMetricsDto({
    required this.averageSignalScore,
    required this.citationCount,
    required this.citationRate,
    required this.collectedPostCount,
    required this.crossSourceSummaryCount,
    required this.duplicateEvidenceCount,
    required this.duplicateRate,
    required this.lowRelevanceSignalCount,
    required this.mutedSignalCount,
    required this.noiseRate,
    required this.selectedEvidenceCount,
    required this.selectionRate,
    required this.summaryCount,
    required this.topReadCount,
    required this.topReadRate,
    required this.usefulSummaryCount,
    required this.userRatedSignalCount,
  });

  factory ReaderSummaryTopicRecommendationMetricsDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryTopicRecommendationMetricsDtoFromJson(json);

  final num averageSignalScore;
  final num citationCount;
  final num citationRate;
  final num collectedPostCount;
  final num crossSourceSummaryCount;
  final num duplicateEvidenceCount;
  final num duplicateRate;
  final num lowRelevanceSignalCount;
  final num mutedSignalCount;
  final num noiseRate;
  final num selectedEvidenceCount;
  final num selectionRate;
  final num summaryCount;
  final num topReadCount;
  final num topReadRate;
  final num usefulSummaryCount;
  final num userRatedSignalCount;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryTopicRecommendationMetricsDtoToJson(this);
}
