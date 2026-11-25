// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'interest_source_daily_history_scheduler_skip_breakdown_response_dto.g.dart';

@JsonSerializable()
class InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto {
  const InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto({
    required this.activeScan,
    required this.duplicateWindow,
    required this.freshSuccess,
    required this.providerFailureBackoff,
    required this.queueBackpressure,
    required this.rateLimitBackoff,
    required this.sourceUnavailable,
  });

  factory InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestSourceDailyHistorySchedulerSkipBreakdownResponseDtoFromJson(
    json,
  );

  final num activeScan;
  final num duplicateWindow;
  final num freshSuccess;
  final num providerFailureBackoff;
  final num queueBackpressure;
  final num rateLimitBackoff;
  final num sourceUnavailable;

  Map<String, Object?> toJson() =>
      _$InterestSourceDailyHistorySchedulerSkipBreakdownResponseDtoToJson(this);
}
