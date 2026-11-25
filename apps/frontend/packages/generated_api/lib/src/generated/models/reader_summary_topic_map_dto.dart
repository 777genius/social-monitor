// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_topic_map_confidence_dto.dart';
import 'reader_summary_topic_map_dto_generated_by_generated_by.dart';
import 'reader_summary_topic_map_dto_schema_version_schema_version.dart';
import 'reader_summary_topic_map_edge_dto.dart';
import 'reader_summary_topic_map_group_dto.dart';
import 'reader_summary_topic_map_node_dto.dart';

part 'reader_summary_topic_map_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicMapDto {
  const ReaderSummaryTopicMapDto({
    required this.confidence,
    required this.edges,
    required this.generatedBy,
    required this.groups,
    required this.nodes,
    required this.schemaVersion,
    required this.warnings,
  });

  factory ReaderSummaryTopicMapDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryTopicMapDtoFromJson(json);

  final ReaderSummaryTopicMapConfidenceDto confidence;
  final List<ReaderSummaryTopicMapEdgeDto> edges;
  final ReaderSummaryTopicMapDtoGeneratedByGeneratedBy generatedBy;
  final List<ReaderSummaryTopicMapGroupDto> groups;
  final List<ReaderSummaryTopicMapNodeDto> nodes;
  final ReaderSummaryTopicMapDtoSchemaVersionSchemaVersion schemaVersion;
  final List<String> warnings;

  Map<String, Object?> toJson() => _$ReaderSummaryTopicMapDtoToJson(this);
}
