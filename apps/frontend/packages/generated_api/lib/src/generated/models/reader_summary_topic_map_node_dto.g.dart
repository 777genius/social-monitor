// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_map_node_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicMapNodeDto _$ReaderSummaryTopicMapNodeDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicMapNodeDto(
  citationIds: (json['citationIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  evidenceCount: json['evidenceCount'] as num,
  groupId: json['groupId'] as String,
  id: json['id'] as String,
  interestIds: (json['interestIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  keywords: (json['keywords'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  label: json['label'] as String,
  popularityScore: json['popularityScore'] as num,
  providerKeys: (json['providerKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  rationale: json['rationale'] as String,
  sizeWeight: json['sizeWeight'] as num,
  storyClusterIds: (json['storyClusterIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ReaderSummaryTopicMapNodeDtoToJson(
  ReaderSummaryTopicMapNodeDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'evidenceCount': instance.evidenceCount,
  'groupId': instance.groupId,
  'id': instance.id,
  'interestIds': instance.interestIds,
  'keywords': instance.keywords,
  'label': instance.label,
  'popularityScore': instance.popularityScore,
  'providerKeys': instance.providerKeys,
  'rationale': instance.rationale,
  'sizeWeight': instance.sizeWeight,
  'storyClusterIds': instance.storyClusterIds,
};
