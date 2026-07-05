// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_topic_map_confidence_dto.dart';

part 'reader_summary_topic_map_group_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicMapGroupDto {
  const ReaderSummaryTopicMapGroupDto({
    required this.colorKey,
    required this.confidence,
    required this.id,
    required this.label,
    required this.nodeIds,
  });

  factory ReaderSummaryTopicMapGroupDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryTopicMapGroupDtoFromJson(json);

  final String colorKey;
  final ReaderSummaryTopicMapConfidenceDto confidence;
  final String id;
  final String label;
  final List<String> nodeIds;

  Map<String, Object?> toJson() => _$ReaderSummaryTopicMapGroupDtoToJson(this);
}
