// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_source_credential_request_dto_kind_kind.dart';

part 'create_source_credential_request_dto.g.dart';

@JsonSerializable()
class CreateSourceCredentialRequestDto {
  const CreateSourceCredentialRequestDto({
    required this.kind,
    required this.providerKey,
    required this.secret,
    this.expiresAt,
    this.scopes,
    this.secretPreview,
  });

  factory CreateSourceCredentialRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$CreateSourceCredentialRequestDtoFromJson(json);

  final DateTime? expiresAt;
  final CreateSourceCredentialRequestDtoKindKind kind;
  final String providerKey;
  final List<String>? scopes;
  final dynamic secret;
  final String? secretPreview;

  Map<String, Object?> toJson() =>
      _$CreateSourceCredentialRequestDtoToJson(this);
}
