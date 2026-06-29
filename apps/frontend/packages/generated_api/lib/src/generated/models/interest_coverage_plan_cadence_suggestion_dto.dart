// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'interest_coverage_plan_cadence_suggestion_dto.g.dart';

@JsonSerializable()
class InterestCoveragePlanCadenceSuggestionDto {
  const InterestCoveragePlanCadenceSuggestionDto({
    required this.freshnessSeconds,
    required this.intervalSeconds,
    required this.retryBudget,
  });

  factory InterestCoveragePlanCadenceSuggestionDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestCoveragePlanCadenceSuggestionDtoFromJson(json);

  final num freshnessSeconds;
  final num intervalSeconds;
  final num retryBudget;

  Map<String, Object?> toJson() =>
      _$InterestCoveragePlanCadenceSuggestionDtoToJson(this);
}
