// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_credential_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceCredentialResponseDto _$SourceCredentialResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceCredentialResponseDto(
  sourceCredential: SourceCredentialViewDto.fromJson(
    json['sourceCredential'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$SourceCredentialResponseDtoToJson(
  SourceCredentialResponseDto instance,
) => <String, dynamic>{'sourceCredential': instance.sourceCredential};
