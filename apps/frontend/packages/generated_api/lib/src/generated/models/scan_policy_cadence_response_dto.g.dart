// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_policy_cadence_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanPolicyCadenceResponseDto _$ScanPolicyCadenceResponseDtoFromJson(
  Map<String, dynamic> json,
) => ScanPolicyCadenceResponseDto(
  configuredFreshnessSeconds: json['configuredFreshnessSeconds'] as num,
  configuredIntervalSeconds: json['configuredIntervalSeconds'] as num,
  effectiveFreshnessSeconds: json['effectiveFreshnessSeconds'] as num,
  effectiveIntervalSeconds: json['effectiveIntervalSeconds'] as num,
  minimumIntervalSeconds: json['minimumIntervalSeconds'] as num,
  providerKey: json['providerKey'] as String,
  providerMinimumIntervalEnforced:
      json['providerMinimumIntervalEnforced'] as bool,
);

Map<String, dynamic> _$ScanPolicyCadenceResponseDtoToJson(
  ScanPolicyCadenceResponseDto instance,
) => <String, dynamic>{
  'configuredFreshnessSeconds': instance.configuredFreshnessSeconds,
  'configuredIntervalSeconds': instance.configuredIntervalSeconds,
  'effectiveFreshnessSeconds': instance.effectiveFreshnessSeconds,
  'effectiveIntervalSeconds': instance.effectiveIntervalSeconds,
  'minimumIntervalSeconds': instance.minimumIntervalSeconds,
  'providerKey': instance.providerKey,
  'providerMinimumIntervalEnforced': instance.providerMinimumIntervalEnforced,
};
