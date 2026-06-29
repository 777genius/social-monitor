// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_coverage_plan_cadence_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestCoveragePlanCadenceSuggestionDto
_$InterestCoveragePlanCadenceSuggestionDtoFromJson(Map<String, dynamic> json) =>
    InterestCoveragePlanCadenceSuggestionDto(
      freshnessSeconds: json['freshnessSeconds'] as num,
      intervalSeconds: json['intervalSeconds'] as num,
      retryBudget: json['retryBudget'] as num,
    );

Map<String, dynamic> _$InterestCoveragePlanCadenceSuggestionDtoToJson(
  InterestCoveragePlanCadenceSuggestionDto instance,
) => <String, dynamic>{
  'freshnessSeconds': instance.freshnessSeconds,
  'intervalSeconds': instance.intervalSeconds,
  'retryBudget': instance.retryBudget,
};
