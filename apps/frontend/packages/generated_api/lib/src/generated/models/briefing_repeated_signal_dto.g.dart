// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_repeated_signal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingRepeatedSignalDto _$BriefingRepeatedSignalDtoFromJson(
  Map<String, dynamic> json,
) => BriefingRepeatedSignalDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  storyClusterId: json['storyClusterId'] as String,
  title: json['title'] as String,
  topicIds: (json['topicIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$BriefingRepeatedSignalDtoToJson(
  BriefingRepeatedSignalDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'storyClusterId': instance.storyClusterId,
  'title': instance.title,
  'topicIds': instance.topicIds,
};
