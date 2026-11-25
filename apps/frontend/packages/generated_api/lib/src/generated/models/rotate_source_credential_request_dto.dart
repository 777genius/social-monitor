// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rotate_source_credential_request_dto.g.dart';

@JsonSerializable()
class RotateSourceCredentialRequestDto {
  const RotateSourceCredentialRequestDto({
    required this.secret,
    this.expiresAt,
    this.scopes,
    this.secretPreview,
  });

  factory RotateSourceCredentialRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$RotateSourceCredentialRequestDtoFromJson(json);

  final DateTime? expiresAt;
  final List<String>? scopes;
  final dynamic secret;
  final String? secretPreview;

  Map<String, Object?> toJson() =>
      _$RotateSourceCredentialRequestDtoToJson(this);
}
