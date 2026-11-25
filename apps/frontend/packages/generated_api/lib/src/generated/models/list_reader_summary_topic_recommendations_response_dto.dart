// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_topic_recommendation_dto.dart';

part 'list_reader_summary_topic_recommendations_response_dto.g.dart';

@JsonSerializable()
class ListReaderSummaryTopicRecommendationsResponseDto {
  const ListReaderSummaryTopicRecommendationsResponseDto({
    required this.items,
    required this.windowEndedAt,
    required this.windowStartedAt,
  });

  factory ListReaderSummaryTopicRecommendationsResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ListReaderSummaryTopicRecommendationsResponseDtoFromJson(json);

  final List<ReaderSummaryTopicRecommendationDto> items;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() =>
      _$ListReaderSummaryTopicRecommendationsResponseDtoToJson(this);
}
