// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'topic_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TopicResponseDto _$TopicResponseDtoFromJson(Map<String, dynamic> json) =>
    TopicResponseDto(
      createdAt: DateTime.parse(json['createdAt'] as String),
      id: json['id'] as String,
      name: json['name'] as String,
      query: json['query'] as String,
      tenantId: json['tenantId'],
      workspaceId: json['workspaceId'],
    );

Map<String, dynamic> _$TopicResponseDtoToJson(TopicResponseDto instance) =>
    <String, dynamic>{
      'createdAt': instance.createdAt.toIso8601String(),
      'id': instance.id,
      'name': instance.name,
      'query': instance.query,
      'tenantId': instance.tenantId,
      'workspaceId': instance.workspaceId,
    };
