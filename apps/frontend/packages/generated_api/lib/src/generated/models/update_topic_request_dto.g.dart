// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_topic_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTopicRequestDto _$UpdateTopicRequestDtoFromJson(
  Map<String, dynamic> json,
) => UpdateTopicRequestDto(
  name: json['name'] as String,
  query: json['query'] as String,
);

Map<String, dynamic> _$UpdateTopicRequestDtoToJson(
  UpdateTopicRequestDto instance,
) => <String, dynamic>{'name': instance.name, 'query': instance.query};
