// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_topic_recommendation_decision_dto_status_status.dart';

part 'reader_summary_topic_recommendation_decision_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicRecommendationDecisionDto {
  const ReaderSummaryTopicRecommendationDecisionDto({
    required this.decidedAt,
    required this.decidedBy,
    required this.recommendationId,
    required this.status,
    required this.topicLabel,
    this.note,
  });

  factory ReaderSummaryTopicRecommendationDecisionDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryTopicRecommendationDecisionDtoFromJson(json);

  final DateTime decidedAt;
  final String decidedBy;
  final String? note;
  final String recommendationId;
  final ReaderSummaryTopicRecommendationDecisionDtoStatusStatus status;
  final String topicLabel;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryTopicRecommendationDecisionDtoToJson(this);
}
