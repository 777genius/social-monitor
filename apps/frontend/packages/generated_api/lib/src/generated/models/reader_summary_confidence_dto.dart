// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_confidence_dto_level_level.dart';

part 'reader_summary_confidence_dto.g.dart';

@JsonSerializable()
class ReaderSummaryConfidenceDto {
  const ReaderSummaryConfidenceDto({
    required this.level,
    required this.rationale,
    required this.score,
  });

  factory ReaderSummaryConfidenceDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryConfidenceDtoFromJson(json);

  final ReaderSummaryConfidenceDtoLevelLevel level;
  final String rationale;
  final num score;

  Map<String, Object?> toJson() => _$ReaderSummaryConfidenceDtoToJson(this);
}
