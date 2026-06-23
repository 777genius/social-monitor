// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_artifact_response_dto.dart';

part 'list_briefings_response_dto.g.dart';

@JsonSerializable()
class ListBriefingsResponseDto {
  const ListBriefingsResponseDto({required this.items, this.nextCursor});

  factory ListBriefingsResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListBriefingsResponseDtoFromJson(json);

  final List<BriefingArtifactResponseDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$ListBriefingsResponseDtoToJson(this);
}
