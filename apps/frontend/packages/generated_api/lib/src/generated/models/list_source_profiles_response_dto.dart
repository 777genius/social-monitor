// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_profile_dto.dart';

part 'list_source_profiles_response_dto.g.dart';

@JsonSerializable()
class ListSourceProfilesResponseDto {
  const ListSourceProfilesResponseDto({required this.sources});

  factory ListSourceProfilesResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListSourceProfilesResponseDtoFromJson(json);

  final List<SourceProfileDto> sources;

  Map<String, Object?> toJson() => _$ListSourceProfilesResponseDtoToJson(this);
}
