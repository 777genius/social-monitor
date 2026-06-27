// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rotate_source_credential_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RotateSourceCredentialRequestDto _$RotateSourceCredentialRequestDtoFromJson(
  Map<String, dynamic> json,
) => RotateSourceCredentialRequestDto(
  secret: json['secret'],
  expiresAt: json['expiresAt'] == null
      ? null
      : DateTime.parse(json['expiresAt'] as String),
  scopes: (json['scopes'] as List<dynamic>?)?.map((e) => e as String).toList(),
  secretPreview: json['secretPreview'] as String?,
);

Map<String, dynamic> _$RotateSourceCredentialRequestDtoToJson(
  RotateSourceCredentialRequestDto instance,
) => <String, dynamic>{
  'expiresAt': instance.expiresAt?.toIso8601String(),
  'scopes': instance.scopes,
  'secret': instance.secret,
  'secretPreview': instance.secretPreview,
};
