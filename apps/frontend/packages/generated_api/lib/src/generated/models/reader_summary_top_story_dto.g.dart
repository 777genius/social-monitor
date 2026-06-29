// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_top_story_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopStoryDto _$ReaderSummaryTopStoryDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopStoryDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  interestIds: (json['interestIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  providerKeys: (json['providerKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  storyClusterId: json['storyClusterId'] as String,
  summary: json['summary'] as String,
  title: json['title'] as String,
);

Map<String, dynamic> _$ReaderSummaryTopStoryDtoToJson(
  ReaderSummaryTopStoryDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'interestIds': instance.interestIds,
  'providerKeys': instance.providerKeys,
  'storyClusterId': instance.storyClusterId,
  'summary': instance.summary,
  'title': instance.title,
};
