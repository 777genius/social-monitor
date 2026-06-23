// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_response_dto_status_status.dart';

part 'source_binding_response_dto.g.dart';

@JsonSerializable()
class SourceBindingResponseDto {
  const SourceBindingResponseDto({
    required this.capabilityProfileVersion,
    required this.configPreview,
    required this.createdAt,
    required this.id,
    required this.providerKey,
    required this.status,
    required this.tenantId,
    required this.topicId,
    required this.workspaceId,
  });

  factory SourceBindingResponseDto.fromJson(Map<String, Object?> json) =>
      _$SourceBindingResponseDtoFromJson(json);

  final num capabilityProfileVersion;
  final dynamic configPreview;
  final DateTime createdAt;
  final String id;
  final String providerKey;
  final SourceBindingResponseDtoStatusStatus status;
  final dynamic tenantId;
  final String topicId;
  final dynamic workspaceId;

  Map<String, Object?> toJson() => _$SourceBindingResponseDtoToJson(this);
}
