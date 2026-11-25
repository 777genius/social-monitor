// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plan_interest_coverage_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlanInterestCoverageResponseDto _$PlanInterestCoverageResponseDtoFromJson(
  Map<String, dynamic> json,
) => PlanInterestCoverageResponseDto(
  coverageGaps: (json['coverageGaps'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  drafts: (json['drafts'] as List<dynamic>)
      .map(
        (e) => InterestCoveragePlanDraftDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  interest: InterestResponseDto.fromJson(
    json['interest'] as Map<String, dynamic>,
  ),
  normalizedKeywords: (json['normalizedKeywords'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  planningQuery: json['planningQuery'] as String,
  skippedProviders: (json['skippedProviders'] as List<dynamic>)
      .map(
        (e) => InterestCoveragePlanSkippedProviderDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  sourcePack: json['sourcePack'] == null
      ? null
      : InterestCoverageSourcePackDto.fromJson(
          json['sourcePack'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$PlanInterestCoverageResponseDtoToJson(
  PlanInterestCoverageResponseDto instance,
) => <String, dynamic>{
  'coverageGaps': instance.coverageGaps,
  'drafts': instance.drafts,
  'interest': instance.interest,
  'normalizedKeywords': instance.normalizedKeywords,
  'planningQuery': instance.planningQuery,
  'skippedProviders': instance.skippedProviders,
  'sourcePack': instance.sourcePack,
};
