// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_topic_highlight_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingTopicHighlightDto _$BriefingTopicHighlightDtoFromJson(
  Map<String, dynamic> json,
) => BriefingTopicHighlightDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  summary: json['summary'] as String,
  title: json['title'] as String,
  topicId: json['topicId'] as String,
);

Map<String, dynamic> _$BriefingTopicHighlightDtoToJson(
  BriefingTopicHighlightDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'summary': instance.summary,
  'title': instance.title,
  'topicId': instance.topicId,
};
