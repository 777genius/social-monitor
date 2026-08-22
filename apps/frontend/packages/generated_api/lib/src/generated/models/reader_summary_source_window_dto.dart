// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_source_window_dto.g.dart';

@JsonSerializable()
class ReaderSummarySourceWindowDto {
  const ReaderSummarySourceWindowDto({
    required this.endedAt,
    required this.selectedFeedItemIds,
    required this.startedAt,
    required this.storyClusterIds,
    required this.windowId,
    this.ingestionCutoff,
  });

  factory ReaderSummarySourceWindowDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummarySourceWindowDtoFromJson(json);

  final DateTime endedAt;
  final DateTime? ingestionCutoff;
  final List<String> selectedFeedItemIds;
  final DateTime startedAt;
  final List<String> storyClusterIds;
  final String windowId;

  Map<String, Object?> toJson() => _$ReaderSummarySourceWindowDtoToJson(this);
}
