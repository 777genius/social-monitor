// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'briefing_source_window_dto.g.dart';

@JsonSerializable()
class BriefingSourceWindowDto {
  const BriefingSourceWindowDto({
    required this.endedAt,
    required this.selectedFeedItemIds,
    required this.startedAt,
    required this.storyClusterIds,
    required this.windowId,
  });

  factory BriefingSourceWindowDto.fromJson(Map<String, Object?> json) =>
      _$BriefingSourceWindowDtoFromJson(json);

  final DateTime endedAt;
  final List<String> selectedFeedItemIds;
  final DateTime startedAt;
  final List<String> storyClusterIds;
  final String windowId;

  Map<String, Object?> toJson() => _$BriefingSourceWindowDtoToJson(this);
}
