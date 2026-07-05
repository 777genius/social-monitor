// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'decide_reader_summary_topic_recommendation_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DecideReaderSummaryTopicRecommendationRequestDto
_$DecideReaderSummaryTopicRecommendationRequestDtoFromJson(
  Map<String, dynamic> json,
) => DecideReaderSummaryTopicRecommendationRequestDto(
  action: DecideReaderSummaryTopicRecommendationRequestDtoActionAction.fromJson(
    json['action'] as String,
  ),
  topicLabel: json['topicLabel'] as String,
  interestIds: (json['interestIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  note: json['note'] as String?,
  providerKeys: (json['providerKeys'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$DecideReaderSummaryTopicRecommendationRequestDtoToJson(
  DecideReaderSummaryTopicRecommendationRequestDto instance,
) => <String, dynamic>{
  'action': instance.action,
  'interestIds': instance.interestIds,
  'note': instance.note,
  'providerKeys': instance.providerKeys,
  'topicLabel': instance.topicLabel,
};
