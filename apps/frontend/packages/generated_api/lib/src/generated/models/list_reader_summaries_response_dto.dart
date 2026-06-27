// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_artifact_response_dto.dart';

part 'list_reader_summaries_response_dto.g.dart';

@JsonSerializable()
class ListReaderSummariesResponseDto {
  const ListReaderSummariesResponseDto({required this.items, this.nextCursor});

  factory ListReaderSummariesResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListReaderSummariesResponseDtoFromJson(json);

  final List<ReaderSummaryArtifactResponseDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$ListReaderSummariesResponseDtoToJson(this);
}
