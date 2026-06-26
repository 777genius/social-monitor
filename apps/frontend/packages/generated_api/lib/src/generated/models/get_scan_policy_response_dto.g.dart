// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'get_scan_policy_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GetScanPolicyResponseDto _$GetScanPolicyResponseDtoFromJson(
  Map<String, dynamic> json,
) => GetScanPolicyResponseDto(
  createdAt: DateTime.parse(json['createdAt'] as String),
  freshnessSeconds: json['freshnessSeconds'] as num,
  id: json['id'] as String,
  intervalSeconds: json['intervalSeconds'] as num,
  nextRunAt: DateTime.parse(json['nextRunAt'] as String),
  retryBudget: json['retryBudget'] as num,
  sourceBindingId: json['sourceBindingId'] as String,
  tenantId: json['tenantId'],
  workspaceId: json['workspaceId'],
  cadence: json['cadence'] == null
      ? null
      : ScanPolicyCadenceResponseDto.fromJson(
          json['cadence'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$GetScanPolicyResponseDtoToJson(
  GetScanPolicyResponseDto instance,
) => <String, dynamic>{
  'cadence': instance.cadence,
  'createdAt': instance.createdAt.toIso8601String(),
  'freshnessSeconds': instance.freshnessSeconds,
  'id': instance.id,
  'intervalSeconds': instance.intervalSeconds,
  'nextRunAt': instance.nextRunAt.toIso8601String(),
  'retryBudget': instance.retryBudget,
  'sourceBindingId': instance.sourceBindingId,
  'tenantId': instance.tenantId,
  'workspaceId': instance.workspaceId,
};
