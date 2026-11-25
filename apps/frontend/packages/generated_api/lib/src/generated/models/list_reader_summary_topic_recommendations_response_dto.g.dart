// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_reader_summary_topic_recommendations_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListReaderSummaryTopicRecommendationsResponseDto
_$ListReaderSummaryTopicRecommendationsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListReaderSummaryTopicRecommendationsResponseDto(
  items: (json['items'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryTopicRecommendationDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
);

Map<String, dynamic> _$ListReaderSummaryTopicRecommendationsResponseDtoToJson(
  ListReaderSummaryTopicRecommendationsResponseDto instance,
) => <String, dynamic>{
  'items': instance.items,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
