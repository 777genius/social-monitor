// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_usage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingUsageDto _$BriefingUsageDtoFromJson(Map<String, dynamic> json) =>
    BriefingUsageDto(
      estimatedCostUsd: json['estimatedCostUsd'] as num,
      inputTokens: json['inputTokens'] as num,
      outputTokens: json['outputTokens'] as num,
    );

Map<String, dynamic> _$BriefingUsageDtoToJson(BriefingUsageDto instance) =>
    <String, dynamic>{
      'estimatedCostUsd': instance.estimatedCostUsd,
      'inputTokens': instance.inputTokens,
      'outputTokens': instance.outputTokens,
    };
