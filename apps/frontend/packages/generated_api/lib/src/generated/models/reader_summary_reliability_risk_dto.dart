// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_reliability_risk_dto_kind_kind.dart';
import 'reader_summary_reliability_risk_dto_level_level.dart';

part 'reader_summary_reliability_risk_dto.g.dart';

@JsonSerializable()
class ReaderSummaryReliabilityRiskDto {
  const ReaderSummaryReliabilityRiskDto({
    required this.description,
    required this.kind,
    required this.level,
    required this.score,
  });

  factory ReaderSummaryReliabilityRiskDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryReliabilityRiskDtoFromJson(json);

  final String description;
  final ReaderSummaryReliabilityRiskDtoKindKind kind;
  final ReaderSummaryReliabilityRiskDtoLevelLevel level;
  final num score;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryReliabilityRiskDtoToJson(this);
}
