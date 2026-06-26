// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'topic_source_daily_history_day_response_dto.dart';
import 'topic_source_daily_history_summary_response_dto.dart';

part 'list_topic_source_daily_history_response_dto.g.dart';

@JsonSerializable()
class ListTopicSourceDailyHistoryResponseDto {
  const ListTopicSourceDailyHistoryResponseDto({
    required this.days,
    required this.maxScanJobs,
    required this.summary,
    required this.topicId,
    required this.truncated,
    required this.windowEndedAt,
    required this.windowStartedAt,
  });

  factory ListTopicSourceDailyHistoryResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ListTopicSourceDailyHistoryResponseDtoFromJson(json);

  final List<TopicSourceDailyHistoryDayResponseDto> days;
  final num maxScanJobs;
  final TopicSourceDailyHistorySummaryResponseDto summary;
  final String topicId;
  final bool truncated;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() =>
      _$ListTopicSourceDailyHistoryResponseDtoToJson(this);
}
