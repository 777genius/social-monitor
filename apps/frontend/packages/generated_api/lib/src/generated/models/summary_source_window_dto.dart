// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'summary_source_window_dto.g.dart';

@JsonSerializable()
class SummarySourceWindowDto {
  const SummarySourceWindowDto({
    required this.endedAt,
    required this.selectedFeedItemIds,
    required this.startedAt,
    required this.windowId,
  });

  factory SummarySourceWindowDto.fromJson(Map<String, Object?> json) =>
      _$SummarySourceWindowDtoFromJson(json);

  final DateTime endedAt;
  final List<String> selectedFeedItemIds;
  final DateTime startedAt;
  final String windowId;

  Map<String, Object?> toJson() => _$SummarySourceWindowDtoToJson(this);
}
