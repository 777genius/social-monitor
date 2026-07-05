// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_topic_map_edge_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicMapEdgeDto {
  const ReaderSummaryTopicMapEdgeDto({
    required this.reason,
    required this.sourceNodeId,
    required this.targetNodeId,
    required this.weight,
  });

  factory ReaderSummaryTopicMapEdgeDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryTopicMapEdgeDtoFromJson(json);

  final String reason;
  final String sourceNodeId;
  final String targetNodeId;
  final num weight;

  Map<String, Object?> toJson() => _$ReaderSummaryTopicMapEdgeDtoToJson(this);
}
