// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'interest_coverage_plan_alternative_draft_dto.g.dart';

@JsonSerializable()
class InterestCoveragePlanAlternativeDraftDto {
  const InterestCoveragePlanAlternativeDraftDto({
    required this.config,
    required this.label,
    required this.rationale,
  });

  factory InterestCoveragePlanAlternativeDraftDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestCoveragePlanAlternativeDraftDtoFromJson(json);

  final dynamic config;
  final String label;
  final List<String> rationale;

  Map<String, Object?> toJson() =>
      _$InterestCoveragePlanAlternativeDraftDtoToJson(this);
}
