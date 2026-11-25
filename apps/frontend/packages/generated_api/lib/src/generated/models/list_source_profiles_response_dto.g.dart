// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_source_profiles_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListSourceProfilesResponseDto _$ListSourceProfilesResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListSourceProfilesResponseDto(
  sources: (json['sources'] as List<dynamic>)
      .map((e) => SourceProfileDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ListSourceProfilesResponseDtoToJson(
  ListSourceProfilesResponseDto instance,
) => <String, dynamic>{'sources': instance.sources};
