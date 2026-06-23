// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_topic_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateTopicRequestDto _$CreateTopicRequestDtoFromJson(
  Map<String, dynamic> json,
) => CreateTopicRequestDto(
  name: json['name'] as String,
  query: json['query'] as String,
);

Map<String, dynamic> _$CreateTopicRequestDtoToJson(
  CreateTopicRequestDto instance,
) => <String, dynamic>{'name': instance.name, 'query': instance.query};
