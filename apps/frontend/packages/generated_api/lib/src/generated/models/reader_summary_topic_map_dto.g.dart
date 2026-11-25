// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_map_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicMapDto _$ReaderSummaryTopicMapDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicMapDto(
  confidence: ReaderSummaryTopicMapConfidenceDto.fromJson(
    json['confidence'] as Map<String, dynamic>,
  ),
  edges: (json['edges'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryTopicMapEdgeDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  generatedBy: ReaderSummaryTopicMapDtoGeneratedByGeneratedBy.fromJson(
    json['generatedBy'] as String,
  ),
  groups: (json['groups'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryTopicMapGroupDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  nodes: (json['nodes'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryTopicMapNodeDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  schemaVersion: ReaderSummaryTopicMapDtoSchemaVersionSchemaVersion.fromJson(
    json['schemaVersion'] as String,
  ),
  warnings: (json['warnings'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ReaderSummaryTopicMapDtoToJson(
  ReaderSummaryTopicMapDto instance,
) => <String, dynamic>{
  'confidence': instance.confidence,
  'edges': instance.edges,
  'generatedBy': instance.generatedBy,
  'groups': instance.groups,
  'nodes': instance.nodes,
  'schemaVersion': instance.schemaVersion,
  'warnings': instance.warnings,
};
