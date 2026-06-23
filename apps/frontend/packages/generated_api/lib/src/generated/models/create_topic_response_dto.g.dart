// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_topic_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateTopicResponseDto _$CreateTopicResponseDtoFromJson(
  Map<String, dynamic> json,
) => CreateTopicResponseDto(
  created: json['created'] as bool,
  topicId: json['topicId'] as String,
);

Map<String, dynamic> _$CreateTopicResponseDtoToJson(
  CreateTopicResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'topicId': instance.topicId,
};
