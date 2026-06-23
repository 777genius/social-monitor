// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_topics_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListTopicsResponseDto _$ListTopicsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListTopicsResponseDto(
  topics: (json['topics'] as List<dynamic>)
      .map((e) => TopicResponseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListTopicsResponseDtoToJson(
  ListTopicsResponseDto instance,
) => <String, dynamic>{
  'nextCursor': instance.nextCursor,
  'topics': instance.topics,
};
