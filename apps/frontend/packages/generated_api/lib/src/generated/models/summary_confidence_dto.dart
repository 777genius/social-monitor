// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_confidence_dto_level_level.dart';

part 'summary_confidence_dto.g.dart';

@JsonSerializable()
class SummaryConfidenceDto {
  const SummaryConfidenceDto({
    required this.level,
    required this.rationale,
    required this.score,
  });

  factory SummaryConfidenceDto.fromJson(Map<String, Object?> json) =>
      _$SummaryConfidenceDtoFromJson(json);

  final SummaryConfidenceDtoLevelLevel level;
  final String rationale;
  final num score;

  Map<String, Object?> toJson() => _$SummaryConfidenceDtoToJson(this);
}
