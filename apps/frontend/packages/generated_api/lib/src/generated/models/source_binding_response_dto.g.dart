// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingResponseDto _$SourceBindingResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingResponseDto(
  capabilityProfileVersion: json['capabilityProfileVersion'] as num,
  configPreview: json['configPreview'],
  createdAt: DateTime.parse(json['createdAt'] as String),
  id: json['id'] as String,
  providerKey: json['providerKey'] as String,
  status: SourceBindingResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  tenantId: json['tenantId'],
  topicId: json['topicId'] as String,
  workspaceId: json['workspaceId'],
);

Map<String, dynamic> _$SourceBindingResponseDtoToJson(
  SourceBindingResponseDto instance,
) => <String, dynamic>{
  'capabilityProfileVersion': instance.capabilityProfileVersion,
  'configPreview': instance.configPreview,
  'createdAt': instance.createdAt.toIso8601String(),
  'id': instance.id,
  'providerKey': instance.providerKey,
  'status': instance.status,
  'tenantId': instance.tenantId,
  'topicId': instance.topicId,
  'workspaceId': instance.workspaceId,
};
