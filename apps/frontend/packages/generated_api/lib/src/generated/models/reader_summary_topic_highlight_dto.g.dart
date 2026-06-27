// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_highlight_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicHighlightDto _$ReaderSummaryTopicHighlightDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicHighlightDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  summary: json['summary'] as String,
  title: json['title'] as String,
  topicId: json['topicId'] as String,
);

Map<String, dynamic> _$ReaderSummaryTopicHighlightDtoToJson(
  ReaderSummaryTopicHighlightDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'summary': instance.summary,
  'title': instance.title,
  'topicId': instance.topicId,
};
