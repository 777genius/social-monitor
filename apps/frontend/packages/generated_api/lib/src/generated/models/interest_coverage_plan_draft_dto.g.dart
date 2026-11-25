// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_coverage_plan_draft_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestCoveragePlanDraftDto _$InterestCoveragePlanDraftDtoFromJson(
  Map<String, dynamic> json,
) => InterestCoveragePlanDraftDto(
  alternativeDrafts: (json['alternativeDrafts'] as List<dynamic>)
      .map(
        (e) => InterestCoveragePlanAlternativeDraftDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  confidenceScore: json['confidenceScore'] as num,
  displayName: json['displayName'] as String,
  priority: json['priority'] as num,
  providerKey: json['providerKey'] as String,
  queryModes: (json['queryModes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  rationale: (json['rationale'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  status: InterestCoveragePlanDraftDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  targetContentUnits: (json['targetContentUnits'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  warnings: (json['warnings'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  applyTarget: json['applyTarget'] == null
      ? null
      : InterestCoveragePlanApplyTargetDto.fromJson(
          json['applyTarget'] as Map<String, dynamic>,
        ),
  cadenceSuggestion: json['cadenceSuggestion'] == null
      ? null
      : InterestCoveragePlanCadenceSuggestionDto.fromJson(
          json['cadenceSuggestion'] as Map<String, dynamic>,
        ),
  existingSourceBindingId: json['existingSourceBindingId'] as String?,
  sourceBindingDraft: json['sourceBindingDraft'] == null
      ? null
      : InterestCoveragePlanBindingDraftDto.fromJson(
          json['sourceBindingDraft'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$InterestCoveragePlanDraftDtoToJson(
  InterestCoveragePlanDraftDto instance,
) => <String, dynamic>{
  'alternativeDrafts': instance.alternativeDrafts,
  'applyTarget': instance.applyTarget,
  'cadenceSuggestion': instance.cadenceSuggestion,
  'confidenceScore': instance.confidenceScore,
  'displayName': instance.displayName,
  'existingSourceBindingId': instance.existingSourceBindingId,
  'priority': instance.priority,
  'providerKey': instance.providerKey,
  'queryModes': instance.queryModes,
  'rationale': instance.rationale,
  'sourceBindingDraft': instance.sourceBindingDraft,
  'status': instance.status,
  'targetContentUnits': instance.targetContentUnits,
  'warnings': instance.warnings,
};
