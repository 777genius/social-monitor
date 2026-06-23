// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'topic_response_dto.dart';

part 'list_topics_response_dto.g.dart';

@JsonSerializable()
class ListTopicsResponseDto {
  const ListTopicsResponseDto({required this.topics, this.nextCursor});

  factory ListTopicsResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListTopicsResponseDtoFromJson(json);

  final String? nextCursor;
  final List<TopicResponseDto> topics;

  Map<String, Object?> toJson() => _$ListTopicsResponseDtoToJson(this);
}
