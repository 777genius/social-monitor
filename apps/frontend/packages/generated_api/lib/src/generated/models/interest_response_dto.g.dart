// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestResponseDto _$InterestResponseDtoFromJson(Map<String, dynamic> json) =>
    InterestResponseDto(
      createdAt: DateTime.parse(json['createdAt'] as String),
      id: json['id'] as String,
      name: json['name'] as String,
      query: json['query'] as String,
      status: InterestResponseDtoStatusStatus.fromJson(
        json['status'] as String,
      ),
      tenantId: json['tenantId'],
      workspaceId: json['workspaceId'],
    );

Map<String, dynamic> _$InterestResponseDtoToJson(
  InterestResponseDto instance,
) => <String, dynamic>{
  'createdAt': instance.createdAt.toIso8601String(),
  'id': instance.id,
  'name': instance.name,
  'query': instance.query,
  'status': instance.status,
  'tenantId': instance.tenantId,
  'workspaceId': instance.workspaceId,
};
