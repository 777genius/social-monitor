// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_usage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryUsageDto _$SummaryUsageDtoFromJson(Map<String, dynamic> json) =>
    SummaryUsageDto(
      estimatedCostUsd: json['estimatedCostUsd'] as num,
      inputTokens: json['inputTokens'] as num,
      outputTokens: json['outputTokens'] as num,
    );

Map<String, dynamic> _$SummaryUsageDtoToJson(SummaryUsageDto instance) =>
    <String, dynamic>{
      'estimatedCostUsd': instance.estimatedCostUsd,
      'inputTokens': instance.inputTokens,
      'outputTokens': instance.outputTokens,
    };
