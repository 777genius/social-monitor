// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_confidence_dto_level_level.dart';

part 'briefing_confidence_dto.g.dart';

@JsonSerializable()
class BriefingConfidenceDto {
  const BriefingConfidenceDto({
    required this.level,
    required this.rationale,
    required this.score,
  });

  factory BriefingConfidenceDto.fromJson(Map<String, Object?> json) =>
      _$BriefingConfidenceDtoFromJson(json);

  final BriefingConfidenceDtoLevelLevel level;
  final String rationale;
  final num score;

  Map<String, Object?> toJson() => _$BriefingConfidenceDtoToJson(this);
}
