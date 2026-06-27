// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_repeated_signal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryRepeatedSignalDto _$ReaderSummaryRepeatedSignalDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryRepeatedSignalDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  storyClusterId: json['storyClusterId'] as String,
  title: json['title'] as String,
  topicIds: (json['topicIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ReaderSummaryRepeatedSignalDtoToJson(
  ReaderSummaryRepeatedSignalDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'storyClusterId': instance.storyClusterId,
  'title': instance.title,
  'topicIds': instance.topicIds,
};
