// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_weekly_projection_story_dto_status_status.dart';

part 'reader_summary_weekly_projection_story_dto.g.dart';

@JsonSerializable()
class ReaderSummaryWeeklyProjectionStoryDto {
  const ReaderSummaryWeeklyProjectionStoryDto({
    required this.citationIds,
    required this.headline,
    required this.observedFrom,
    required this.observedThrough,
    required this.status,
    required this.storyId,
    required this.summary,
  });

  factory ReaderSummaryWeeklyProjectionStoryDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryWeeklyProjectionStoryDtoFromJson(json);

  final List<String> citationIds;
  final String headline;
  final DateTime observedFrom;
  final DateTime observedThrough;
  final ReaderSummaryWeeklyProjectionStoryDtoStatusStatus status;
  final String storyId;
  final String summary;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryWeeklyProjectionStoryDtoToJson(this);
}
