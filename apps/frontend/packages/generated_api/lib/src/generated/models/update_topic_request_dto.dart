// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_topic_request_dto.g.dart';

@JsonSerializable()
class UpdateTopicRequestDto {
  const UpdateTopicRequestDto({required this.name, required this.query});

  factory UpdateTopicRequestDto.fromJson(Map<String, Object?> json) =>
      _$UpdateTopicRequestDtoFromJson(json);

  final String name;
  final String query;

  Map<String, Object?> toJson() => _$UpdateTopicRequestDtoToJson(this);
}
