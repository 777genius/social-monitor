// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_topic_response_dto.g.dart';

@JsonSerializable()
class CreateTopicResponseDto {
  const CreateTopicResponseDto({required this.created, required this.topicId});

  factory CreateTopicResponseDto.fromJson(Map<String, Object?> json) =>
      _$CreateTopicResponseDtoFromJson(json);

  final bool created;
  final String topicId;

  Map<String, Object?> toJson() => _$CreateTopicResponseDtoToJson(this);
}
