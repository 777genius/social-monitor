// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'interest_source_daily_history_day_response_dto.dart';
import 'interest_source_daily_history_summary_response_dto.dart';

part 'list_interest_source_daily_history_response_dto.g.dart';

@JsonSerializable()
class ListInterestSourceDailyHistoryResponseDto {
  const ListInterestSourceDailyHistoryResponseDto({
    required this.days,
    required this.interestId,
    required this.maxScanJobs,
    required this.summary,
    required this.truncated,
    required this.windowEndedAt,
    required this.windowStartedAt,
  });

  factory ListInterestSourceDailyHistoryResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ListInterestSourceDailyHistoryResponseDtoFromJson(json);

  final List<InterestSourceDailyHistoryDayResponseDto> days;
  final String interestId;
  final num maxScanJobs;
  final InterestSourceDailyHistorySummaryResponseDto summary;
  final bool truncated;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() =>
      _$ListInterestSourceDailyHistoryResponseDtoToJson(this);
}
