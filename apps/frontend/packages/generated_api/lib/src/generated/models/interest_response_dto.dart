// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'interest_response_dto_status_status.dart';

part 'interest_response_dto.g.dart';

@JsonSerializable()
class InterestResponseDto {
  const InterestResponseDto({
    required this.createdAt,
    required this.id,
    required this.name,
    required this.query,
    required this.status,
    required this.tenantId,
    required this.workspaceId,
  });

  factory InterestResponseDto.fromJson(Map<String, Object?> json) =>
      _$InterestResponseDtoFromJson(json);

  final DateTime createdAt;
  final String id;
  final String name;
  final String query;
  final InterestResponseDtoStatusStatus status;
  final dynamic tenantId;
  final dynamic workspaceId;

  Map<String, Object?> toJson() => _$InterestResponseDtoToJson(this);
}
