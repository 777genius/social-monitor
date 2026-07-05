// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_topic_recommendation_dto_current_tier_current_tier.dart';
import 'reader_summary_topic_recommendation_dto_decision_status_decision_status.dart';
import 'reader_summary_topic_recommendation_dto_kind_kind.dart';
import 'reader_summary_topic_recommendation_dto_suggested_tier_suggested_tier.dart';
import 'reader_summary_topic_recommendation_metrics_dto.dart';

part 'reader_summary_topic_recommendation_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicRecommendationDto {
  const ReaderSummaryTopicRecommendationDto({
    required this.confidenceScore,
    required this.currentTier,
    required this.decisionStatus,
    required this.evidenceReaderSummaryIds,
    required this.interestIds,
    required this.kind,
    required this.metrics,
    required this.providerKeys,
    required this.rationale,
    required this.reasons,
    required this.recommendationId,
    required this.suggestedTier,
    required this.topicLabel,
    required this.windowDays,
    this.decidedAt,
    this.decidedBy,
    this.decisionNote,
  });

  factory ReaderSummaryTopicRecommendationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryTopicRecommendationDtoFromJson(json);

  final num confidenceScore;
  final ReaderSummaryTopicRecommendationDtoCurrentTierCurrentTier currentTier;
  final DateTime? decidedAt;
  final String? decidedBy;
  final String? decisionNote;
  final ReaderSummaryTopicRecommendationDtoDecisionStatusDecisionStatus
  decisionStatus;
  final List<String> evidenceReaderSummaryIds;
  final List<String> interestIds;
  final ReaderSummaryTopicRecommendationDtoKindKind kind;
  final ReaderSummaryTopicRecommendationMetricsDto metrics;
  final List<String> providerKeys;
  final String rationale;
  final List<String> reasons;
  final String recommendationId;
  final ReaderSummaryTopicRecommendationDtoSuggestedTierSuggestedTier
  suggestedTier;
  final String topicLabel;
  final num windowDays;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryTopicRecommendationDtoToJson(this);
}
