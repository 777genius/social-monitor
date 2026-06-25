// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_reader_item_confidence_dto_level_level.dart';

part 'briefing_reader_item_confidence_dto.g.dart';

@JsonSerializable()
class BriefingReaderItemConfidenceDto {
  const BriefingReaderItemConfidenceDto({
    required this.level,
    required this.rationale,
    required this.score,
  });

  factory BriefingReaderItemConfidenceDto.fromJson(Map<String, Object?> json) =>
      _$BriefingReaderItemConfidenceDtoFromJson(json);

  final BriefingReaderItemConfidenceDtoLevelLevel level;
  final String rationale;
  final num score;

  Map<String, Object?> toJson() =>
      _$BriefingReaderItemConfidenceDtoToJson(this);
}
