// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_coverage_plan_alternative_draft_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestCoveragePlanAlternativeDraftDto
_$InterestCoveragePlanAlternativeDraftDtoFromJson(Map<String, dynamic> json) =>
    InterestCoveragePlanAlternativeDraftDto(
      config: json['config'],
      label: json['label'] as String,
      rationale: (json['rationale'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$InterestCoveragePlanAlternativeDraftDtoToJson(
  InterestCoveragePlanAlternativeDraftDto instance,
) => <String, dynamic>{
  'config': instance.config,
  'label': instance.label,
  'rationale': instance.rationale,
};
