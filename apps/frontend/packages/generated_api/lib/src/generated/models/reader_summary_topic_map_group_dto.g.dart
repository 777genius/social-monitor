// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_map_group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicMapGroupDto _$ReaderSummaryTopicMapGroupDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicMapGroupDto(
  colorKey: json['colorKey'] as String,
  confidence: ReaderSummaryTopicMapConfidenceDto.fromJson(
    json['confidence'] as Map<String, dynamic>,
  ),
  id: json['id'] as String,
  label: json['label'] as String,
  nodeIds: (json['nodeIds'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$ReaderSummaryTopicMapGroupDtoToJson(
  ReaderSummaryTopicMapGroupDto instance,
) => <String, dynamic>{
  'colorKey': instance.colorKey,
  'confidence': instance.confidence,
  'id': instance.id,
  'label': instance.label,
  'nodeIds': instance.nodeIds,
};
