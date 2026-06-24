// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_source_mix_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingSourceMixEntryDto _$BriefingSourceMixEntryDtoFromJson(
  Map<String, dynamic> json,
) => BriefingSourceMixEntryDto(
  citationCount: json['citationCount'] as num,
  crossSourceClusterCount: json['crossSourceClusterCount'] as num,
  itemCount: json['itemCount'] as num,
  providerKey: json['providerKey'] as String,
  singleSourceOnly: json['singleSourceOnly'] as bool,
  storyClusterCount: json['storyClusterCount'] as num,
  topicIds: (json['topicIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$BriefingSourceMixEntryDtoToJson(
  BriefingSourceMixEntryDto instance,
) => <String, dynamic>{
  'citationCount': instance.citationCount,
  'crossSourceClusterCount': instance.crossSourceClusterCount,
  'itemCount': instance.itemCount,
  'providerKey': instance.providerKey,
  'singleSourceOnly': instance.singleSourceOnly,
  'storyClusterCount': instance.storyClusterCount,
  'topicIds': instance.topicIds,
};
