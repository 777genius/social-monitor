// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_usage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryUsageDto _$ReaderSummaryUsageDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryUsageDto(
  estimatedCostUsd: json['estimatedCostUsd'] as num,
  inputTokens: json['inputTokens'] as num,
  outputTokens: json['outputTokens'] as num,
);

Map<String, dynamic> _$ReaderSummaryUsageDtoToJson(
  ReaderSummaryUsageDto instance,
) => <String, dynamic>{
  'estimatedCostUsd': instance.estimatedCostUsd,
  'inputTokens': instance.inputTokens,
  'outputTokens': instance.outputTokens,
};
