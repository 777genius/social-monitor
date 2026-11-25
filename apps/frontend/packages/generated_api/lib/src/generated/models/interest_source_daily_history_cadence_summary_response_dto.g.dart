// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_source_daily_history_cadence_summary_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestSourceDailyHistoryCadenceSummaryResponseDto
_$InterestSourceDailyHistoryCadenceSummaryResponseDtoFromJson(
  Map<String, dynamic> json,
) => InterestSourceDailyHistoryCadenceSummaryResponseDto(
  maxConfiguredIntervalSeconds: json['maxConfiguredIntervalSeconds'] as num,
  maxEffectiveFreshnessSeconds: json['maxEffectiveFreshnessSeconds'] as num,
  maxEffectiveIntervalSeconds: json['maxEffectiveIntervalSeconds'] as num,
  minConfiguredIntervalSeconds: json['minConfiguredIntervalSeconds'] as num,
  minEffectiveFreshnessSeconds: json['minEffectiveFreshnessSeconds'] as num,
  minEffectiveIntervalSeconds: json['minEffectiveIntervalSeconds'] as num,
  minimumIntervalSeconds: json['minimumIntervalSeconds'] as num,
  providerMinimumIntervalEnforced:
      json['providerMinimumIntervalEnforced'] as bool,
  sourceBindingCount: json['sourceBindingCount'] as num,
);

Map<String, dynamic>
_$InterestSourceDailyHistoryCadenceSummaryResponseDtoToJson(
  InterestSourceDailyHistoryCadenceSummaryResponseDto instance,
) => <String, dynamic>{
  'maxConfiguredIntervalSeconds': instance.maxConfiguredIntervalSeconds,
  'maxEffectiveFreshnessSeconds': instance.maxEffectiveFreshnessSeconds,
  'maxEffectiveIntervalSeconds': instance.maxEffectiveIntervalSeconds,
  'minConfiguredIntervalSeconds': instance.minConfiguredIntervalSeconds,
  'minEffectiveFreshnessSeconds': instance.minEffectiveFreshnessSeconds,
  'minEffectiveIntervalSeconds': instance.minEffectiveIntervalSeconds,
  'minimumIntervalSeconds': instance.minimumIntervalSeconds,
  'providerMinimumIntervalEnforced': instance.providerMinimumIntervalEnforced,
  'sourceBindingCount': instance.sourceBindingCount,
};
