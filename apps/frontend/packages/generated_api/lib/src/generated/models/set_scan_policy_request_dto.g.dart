// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_scan_policy_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetScanPolicyRequestDto _$SetScanPolicyRequestDtoFromJson(
  Map<String, dynamic> json,
) => SetScanPolicyRequestDto(
  freshnessSeconds: json['freshnessSeconds'] as num,
  intervalSeconds: json['intervalSeconds'] as num,
  retryBudget: json['retryBudget'] as num,
);

Map<String, dynamic> _$SetScanPolicyRequestDtoToJson(
  SetScanPolicyRequestDto instance,
) => <String, dynamic>{
  'freshnessSeconds': instance.freshnessSeconds,
  'intervalSeconds': instance.intervalSeconds,
  'retryBudget': instance.retryBudget,
};
