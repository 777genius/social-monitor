// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_credential_view_dto.dart';

part 'source_credential_response_dto.g.dart';

@JsonSerializable()
class SourceCredentialResponseDto {
  const SourceCredentialResponseDto({required this.sourceCredential});

  factory SourceCredentialResponseDto.fromJson(Map<String, Object?> json) =>
      _$SourceCredentialResponseDtoFromJson(json);

  final SourceCredentialViewDto sourceCredential;

  Map<String, Object?> toJson() => _$SourceCredentialResponseDtoToJson(this);
}
