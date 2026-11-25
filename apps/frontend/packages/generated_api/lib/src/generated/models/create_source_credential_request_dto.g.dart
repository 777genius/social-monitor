// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_source_credential_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateSourceCredentialRequestDto _$CreateSourceCredentialRequestDtoFromJson(
  Map<String, dynamic> json,
) => CreateSourceCredentialRequestDto(
  kind: CreateSourceCredentialRequestDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  providerKey: json['providerKey'] as String,
  secret: json['secret'],
  expiresAt: json['expiresAt'] == null
      ? null
      : DateTime.parse(json['expiresAt'] as String),
  scopes: (json['scopes'] as List<dynamic>?)?.map((e) => e as String).toList(),
  secretPreview: json['secretPreview'] as String?,
);

Map<String, dynamic> _$CreateSourceCredentialRequestDtoToJson(
  CreateSourceCredentialRequestDto instance,
) => <String, dynamic>{
  'expiresAt': instance.expiresAt?.toIso8601String(),
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'scopes': instance.scopes,
  'secret': instance.secret,
  'secretPreview': instance.secretPreview,
};
