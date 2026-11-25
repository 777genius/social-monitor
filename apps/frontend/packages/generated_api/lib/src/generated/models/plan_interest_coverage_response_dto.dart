// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'interest_coverage_plan_draft_dto.dart';
import 'interest_coverage_plan_skipped_provider_dto.dart';
import 'interest_coverage_source_pack_dto.dart';
import 'interest_response_dto.dart';

part 'plan_interest_coverage_response_dto.g.dart';

@JsonSerializable()
class PlanInterestCoverageResponseDto {
  const PlanInterestCoverageResponseDto({
    required this.coverageGaps,
    required this.drafts,
    required this.interest,
    required this.normalizedKeywords,
    required this.planningQuery,
    required this.skippedProviders,
    this.sourcePack,
  });

  factory PlanInterestCoverageResponseDto.fromJson(Map<String, Object?> json) =>
      _$PlanInterestCoverageResponseDtoFromJson(json);

  final List<String> coverageGaps;
  final List<InterestCoveragePlanDraftDto> drafts;
  final InterestResponseDto interest;
  final List<String> normalizedKeywords;
  final String planningQuery;
  final List<InterestCoveragePlanSkippedProviderDto> skippedProviders;
  final InterestCoverageSourcePackDto? sourcePack;

  Map<String, Object?> toJson() =>
      _$PlanInterestCoverageResponseDtoToJson(this);
}
