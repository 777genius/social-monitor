// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'decide_reader_summary_topic_recommendation_response_dto_decision_status_decision_status.dart';
import 'reader_summary_accepted_topic_application_dto.dart';
import 'reader_summary_accepted_topic_reversion_dto.dart';
import 'reader_summary_topic_recommendation_decision_dto.dart';

part 'decide_reader_summary_topic_recommendation_response_dto.g.dart';

@JsonSerializable()
class DecideReaderSummaryTopicRecommendationResponseDto {
  const DecideReaderSummaryTopicRecommendationResponseDto({
    required this.application,
    required this.decisionStatus,
    required this.reversion,
    this.decision,
  });

  factory DecideReaderSummaryTopicRecommendationResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$DecideReaderSummaryTopicRecommendationResponseDtoFromJson(json);

  final ReaderSummaryAcceptedTopicApplicationDto application;
  final ReaderSummaryTopicRecommendationDecisionDto? decision;
  final DecideReaderSummaryTopicRecommendationResponseDtoDecisionStatusDecisionStatus
  decisionStatus;
  final ReaderSummaryAcceptedTopicReversionDto reversion;

  Map<String, Object?> toJson() =>
      _$DecideReaderSummaryTopicRecommendationResponseDtoToJson(this);
}
