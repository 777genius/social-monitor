// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_health_policy_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingHealthPolicyResponseDto
_$SourceBindingHealthPolicyResponseDtoFromJson(Map<String, dynamic> json) =>
    SourceBindingHealthPolicyResponseDto(
      createdAt: DateTime.parse(json['createdAt'] as String),
      freshnessSeconds: json['freshnessSeconds'] as num,
      id: json['id'] as String,
      intervalSeconds: json['intervalSeconds'] as num,
      isDue: json['isDue'] as bool,
      nextRunAt: DateTime.parse(json['nextRunAt'] as String),
      retryBudget: json['retryBudget'] as num,
      sourceBindingId: json['sourceBindingId'] as String,
      tenantId: json['tenantId'],
      workspaceId: json['workspaceId'],
    );

Map<String, dynamic> _$SourceBindingHealthPolicyResponseDtoToJson(
  SourceBindingHealthPolicyResponseDto instance,
) => <String, dynamic>{
  'createdAt': instance.createdAt.toIso8601String(),
  'freshnessSeconds': instance.freshnessSeconds,
  'id': instance.id,
  'intervalSeconds': instance.intervalSeconds,
  'isDue': instance.isDue,
  'nextRunAt': instance.nextRunAt.toIso8601String(),
  'retryBudget': instance.retryBudget,
  'sourceBindingId': instance.sourceBindingId,
  'tenantId': instance.tenantId,
  'workspaceId': instance.workspaceId,
};
