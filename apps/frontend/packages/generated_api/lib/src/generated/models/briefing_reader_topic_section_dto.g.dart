// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_reader_topic_section_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingReaderTopicSectionDto _$BriefingReaderTopicSectionDtoFromJson(
  Map<String, dynamic> json,
) => BriefingReaderTopicSectionDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  insight: json['insight'] as String,
  items: (json['items'] as List<dynamic>)
      .map((e) => BriefingReaderItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  title: json['title'] as String,
  topicId: json['topicId'] as String?,
);

Map<String, dynamic> _$BriefingReaderTopicSectionDtoToJson(
  BriefingReaderTopicSectionDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'insight': instance.insight,
  'items': instance.items,
  'title': instance.title,
  'topicId': instance.topicId,
};
