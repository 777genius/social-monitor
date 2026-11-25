// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'decide_reader_summary_topic_recommendation_request_dto_action_action.dart';

part 'decide_reader_summary_topic_recommendation_request_dto.g.dart';

@JsonSerializable()
class DecideReaderSummaryTopicRecommendationRequestDto {
  const DecideReaderSummaryTopicRecommendationRequestDto({
    required this.action,
    required this.topicLabel,
    this.interestIds,
    this.note,
    this.providerKeys,
  });

  factory DecideReaderSummaryTopicRecommendationRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$DecideReaderSummaryTopicRecommendationRequestDtoFromJson(json);

  final DecideReaderSummaryTopicRecommendationRequestDtoActionAction action;
  final List<String>? interestIds;
  final String? note;
  final List<String>? providerKeys;
  final String topicLabel;

  Map<String, Object?> toJson() =>
      _$DecideReaderSummaryTopicRecommendationRequestDtoToJson(this);
}
