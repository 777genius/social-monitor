// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_credential_view_dto.dart';

part 'list_source_credentials_response_dto.g.dart';

@JsonSerializable()
class ListSourceCredentialsResponseDto {
  const ListSourceCredentialsResponseDto({
    required this.sourceCredentials,
    this.nextCursor,
  });

  factory ListSourceCredentialsResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ListSourceCredentialsResponseDtoFromJson(json);

  final String? nextCursor;
  final List<SourceCredentialViewDto> sourceCredentials;

  Map<String, Object?> toJson() =>
      _$ListSourceCredentialsResponseDtoToJson(this);
}
