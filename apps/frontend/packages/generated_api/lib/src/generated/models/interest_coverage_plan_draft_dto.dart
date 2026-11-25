// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'interest_coverage_plan_alternative_draft_dto.dart';
import 'interest_coverage_plan_apply_target_dto.dart';
import 'interest_coverage_plan_binding_draft_dto.dart';
import 'interest_coverage_plan_cadence_suggestion_dto.dart';
import 'interest_coverage_plan_draft_dto_status_status.dart';

part 'interest_coverage_plan_draft_dto.g.dart';

@JsonSerializable()
class InterestCoveragePlanDraftDto {
  const InterestCoveragePlanDraftDto({
    required this.alternativeDrafts,
    required this.confidenceScore,
    required this.displayName,
    required this.priority,
    required this.providerKey,
    required this.queryModes,
    required this.rationale,
    required this.status,
    required this.targetContentUnits,
    required this.warnings,
    this.applyTarget,
    this.cadenceSuggestion,
    this.existingSourceBindingId,
    this.sourceBindingDraft,
  });

  factory InterestCoveragePlanDraftDto.fromJson(Map<String, Object?> json) =>
      _$InterestCoveragePlanDraftDtoFromJson(json);

  final List<InterestCoveragePlanAlternativeDraftDto> alternativeDrafts;
  final InterestCoveragePlanApplyTargetDto? applyTarget;
  final InterestCoveragePlanCadenceSuggestionDto? cadenceSuggestion;
  final num confidenceScore;
  final String displayName;
  final String? existingSourceBindingId;
  final num priority;
  final String providerKey;
  final List<String> queryModes;
  final List<String> rationale;
  final InterestCoveragePlanBindingDraftDto? sourceBindingDraft;
  final InterestCoveragePlanDraftDtoStatusStatus status;
  final List<String> targetContentUnits;
  final List<String> warnings;

  Map<String, Object?> toJson() => _$InterestCoveragePlanDraftDtoToJson(this);
}
