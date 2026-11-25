// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_artifact_response_dto.dart';

part 'list_summaries_response_dto.g.dart';

@JsonSerializable()
class ListSummariesResponseDto {
  const ListSummariesResponseDto({required this.items, this.nextCursor});

  factory ListSummariesResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListSummariesResponseDtoFromJson(json);

  final List<SummaryArtifactResponseDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$ListSummariesResponseDtoToJson(this);
}
