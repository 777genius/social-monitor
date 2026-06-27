// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_credential_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceCredentialViewDto _$SourceCredentialViewDtoFromJson(
  Map<String, dynamic> json,
) => SourceCredentialViewDto(
  createdAt: DateTime.parse(json['createdAt'] as String),
  id: json['id'] as String,
  kind: SourceCredentialViewDtoKindKind.fromJson(json['kind'] as String),
  providerKey: json['providerKey'] as String,
  scopes: (json['scopes'] as List<dynamic>).map((e) => e as String).toList(),
  secretPreview: json['secretPreview'] as String,
  status: SourceCredentialViewDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  tenantId: json['tenantId'],
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  workspaceId: json['workspaceId'],
  expiresAt: json['expiresAt'] == null
      ? null
      : DateTime.parse(json['expiresAt'] as String),
  revokedAt: json['revokedAt'] == null
      ? null
      : DateTime.parse(json['revokedAt'] as String),
  rotatedAt: json['rotatedAt'] == null
      ? null
      : DateTime.parse(json['rotatedAt'] as String),
);

Map<String, dynamic> _$SourceCredentialViewDtoToJson(
  SourceCredentialViewDto instance,
) => <String, dynamic>{
  'createdAt': instance.createdAt.toIso8601String(),
  'expiresAt': instance.expiresAt?.toIso8601String(),
  'id': instance.id,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'revokedAt': instance.revokedAt?.toIso8601String(),
  'rotatedAt': instance.rotatedAt?.toIso8601String(),
  'scopes': instance.scopes,
  'secretPreview': instance.secretPreview,
  'status': instance.status,
  'tenantId': instance.tenantId,
  'updatedAt': instance.updatedAt.toIso8601String(),
  'workspaceId': instance.workspaceId,
};
