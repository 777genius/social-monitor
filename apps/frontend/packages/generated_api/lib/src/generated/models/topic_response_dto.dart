// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'topic_response_dto_status_status.dart';

part 'topic_response_dto.g.dart';

@JsonSerializable()
class TopicResponseDto {
  const TopicResponseDto({
    required this.createdAt,
    required this.id,
    required this.name,
    required this.query,
    required this.status,
    required this.tenantId,
    required this.workspaceId,
  });

  factory TopicResponseDto.fromJson(Map<String, Object?> json) =>
      _$TopicResponseDtoFromJson(json);

  final DateTime createdAt;
  final String id;
  final String name;
  final String query;
  final TopicResponseDtoStatusStatus status;
  final dynamic tenantId;
  final dynamic workspaceId;

  Map<String, Object?> toJson() => _$TopicResponseDtoToJson(this);
}
