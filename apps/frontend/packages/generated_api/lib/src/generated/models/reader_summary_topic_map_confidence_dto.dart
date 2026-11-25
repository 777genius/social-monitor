// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_topic_map_confidence_dto_level_level.dart';

part 'reader_summary_topic_map_confidence_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicMapConfidenceDto {
  const ReaderSummaryTopicMapConfidenceDto({
    required this.level,
    required this.rationale,
    required this.score,
  });

  factory ReaderSummaryTopicMapConfidenceDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryTopicMapConfidenceDtoFromJson(json);

  final ReaderSummaryTopicMapConfidenceDtoLevelLevel level;
  final String rationale;
  final num score;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryTopicMapConfidenceDtoToJson(this);
}
