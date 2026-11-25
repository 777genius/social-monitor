// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_map_edge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicMapEdgeDto _$ReaderSummaryTopicMapEdgeDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicMapEdgeDto(
  reason: json['reason'] as String,
  sourceNodeId: json['sourceNodeId'] as String,
  targetNodeId: json['targetNodeId'] as String,
  weight: json['weight'] as num,
);

Map<String, dynamic> _$ReaderSummaryTopicMapEdgeDtoToJson(
  ReaderSummaryTopicMapEdgeDto instance,
) => <String, dynamic>{
  'reason': instance.reason,
  'sourceNodeId': instance.sourceNodeId,
  'targetNodeId': instance.targetNodeId,
  'weight': instance.weight,
};
