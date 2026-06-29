// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_source_mix_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummarySourceMixEntryDto _$ReaderSummarySourceMixEntryDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummarySourceMixEntryDto(
  citationCount: json['citationCount'] as num,
  crossSourceClusterCount: json['crossSourceClusterCount'] as num,
  interestIds: (json['interestIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  itemCount: json['itemCount'] as num,
  providerKey: json['providerKey'] as String,
  singleSourceOnly: json['singleSourceOnly'] as bool,
  storyClusterCount: json['storyClusterCount'] as num,
);

Map<String, dynamic> _$ReaderSummarySourceMixEntryDtoToJson(
  ReaderSummarySourceMixEntryDto instance,
) => <String, dynamic>{
  'citationCount': instance.citationCount,
  'crossSourceClusterCount': instance.crossSourceClusterCount,
  'interestIds': instance.interestIds,
  'itemCount': instance.itemCount,
  'providerKey': instance.providerKey,
  'singleSourceOnly': instance.singleSourceOnly,
  'storyClusterCount': instance.storyClusterCount,
};
