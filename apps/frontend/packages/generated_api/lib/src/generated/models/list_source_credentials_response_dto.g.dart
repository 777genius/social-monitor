// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_source_credentials_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListSourceCredentialsResponseDto _$ListSourceCredentialsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListSourceCredentialsResponseDto(
  sourceCredentials: (json['sourceCredentials'] as List<dynamic>)
      .map((e) => SourceCredentialViewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListSourceCredentialsResponseDtoToJson(
  ListSourceCredentialsResponseDto instance,
) => <String, dynamic>{
  'nextCursor': instance.nextCursor,
  'sourceCredentials': instance.sourceCredentials,
};
