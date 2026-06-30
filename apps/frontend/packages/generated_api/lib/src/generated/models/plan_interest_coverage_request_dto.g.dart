// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plan_interest_coverage_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlanInterestCoverageRequestDto _$PlanInterestCoverageRequestDtoFromJson(
  Map<String, dynamic> json,
) => PlanInterestCoverageRequestDto(
  description: json['description'] as String?,
  excludeProviders: (json['excludeProviders'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  includeProviders: (json['includeProviders'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  keywords: (json['keywords'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  rssFeedUrls: (json['rssFeedUrls'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  sourcePackKey: json['sourcePackKey'] as String?,
  subreddits: (json['subreddits'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$PlanInterestCoverageRequestDtoToJson(
  PlanInterestCoverageRequestDto instance,
) => <String, dynamic>{
  'description': instance.description,
  'excludeProviders': instance.excludeProviders,
  'includeProviders': instance.includeProviders,
  'keywords': instance.keywords,
  'rssFeedUrls': instance.rssFeedUrls,
  'sourcePackKey': instance.sourcePackKey,
  'subreddits': instance.subreddits,
};
