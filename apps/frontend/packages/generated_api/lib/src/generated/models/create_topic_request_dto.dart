// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_topic_request_dto.g.dart';

@JsonSerializable()
class CreateTopicRequestDto {
  const CreateTopicRequestDto({required this.name, required this.query});

  factory CreateTopicRequestDto.fromJson(Map<String, Object?> json) =>
      _$CreateTopicRequestDtoFromJson(json);

  final String name;
  final String query;

  Map<String, Object?> toJson() => _$CreateTopicRequestDtoToJson(this);
}
