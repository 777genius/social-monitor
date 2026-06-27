// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_credential_view_dto_kind_kind.dart';
import 'source_credential_view_dto_status_status.dart';

part 'source_credential_view_dto.g.dart';

@JsonSerializable()
class SourceCredentialViewDto {
  const SourceCredentialViewDto({
    required this.createdAt,
    required this.id,
    required this.kind,
    required this.providerKey,
    required this.scopes,
    required this.secretPreview,
    required this.status,
    required this.tenantId,
    required this.updatedAt,
    required this.workspaceId,
    this.expiresAt,
    this.revokedAt,
    this.rotatedAt,
  });

  factory SourceCredentialViewDto.fromJson(Map<String, Object?> json) =>
      _$SourceCredentialViewDtoFromJson(json);

  final DateTime createdAt;
  final DateTime? expiresAt;
  final String id;
  final SourceCredentialViewDtoKindKind kind;
  final String providerKey;
  final DateTime? revokedAt;
  final DateTime? rotatedAt;
  final List<String> scopes;
  final String secretPreview;
  final SourceCredentialViewDtoStatusStatus status;
  final dynamic tenantId;
  final DateTime updatedAt;
  final dynamic workspaceId;

  Map<String, Object?> toJson() => _$SourceCredentialViewDtoToJson(this);
}
