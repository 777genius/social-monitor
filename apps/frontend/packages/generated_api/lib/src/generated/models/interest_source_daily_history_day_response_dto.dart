// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'interest_source_daily_history_day_response_dto_provider_health_state_provider_health_state.dart';
import 'interest_source_daily_history_day_response_dto_scan_coverage_state_scan_coverage_state.dart';
import 'interest_source_daily_history_provider_response_dto.dart';
import 'interest_source_daily_history_scheduler_skip_breakdown_response_dto.dart';

part 'interest_source_daily_history_day_response_dto.g.dart';

@JsonSerializable()
class InterestSourceDailyHistoryDayResponseDto {
  const InterestSourceDailyHistoryDayResponseDto({
    required this.activeScans,
    required this.configuredSourceBindingCount,
    required this.consecutiveFailures,
    required this.date,
    required this.enabledSourceBindingCount,
    required this.failedScans,
    required this.fetched,
    required this.inserted,
    required this.operatorAction,
    required this.pausedSourceBindingCount,
    required this.projected,
    required this.providerBreakdown,
    required this.providerHealthState,
    required this.providerUnavailableScans,
    required this.rateLimitedScans,
    required this.scanCoverageState,
    required this.scannedSourceBindingCount,
    required this.schedulerDecisionCount,
    required this.schedulerEnqueuedCount,
    required this.schedulerSkippedByReason,
    required this.schedulerSkippedCount,
    required this.signals,
    required this.skippedDuplicates,
    required this.sourceBindingCount,
    required this.succeededScans,
    required this.totalScans,
    required this.unconfiguredSourceBindingCount,
    required this.unscannedSourceBindingCount,
    required this.windowEndedAt,
    required this.windowStartedAt,
    this.lastCompletedAt,
    this.lastScanRequestedAt,
    this.lastSchedulerEvaluatedAt,
  });

  factory InterestSourceDailyHistoryDayResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestSourceDailyHistoryDayResponseDtoFromJson(json);

  final num activeScans;
  final num configuredSourceBindingCount;
  final num consecutiveFailures;
  final String date;
  final num enabledSourceBindingCount;
  final num failedScans;
  final num fetched;
  final num inserted;
  final DateTime? lastCompletedAt;
  final DateTime? lastScanRequestedAt;
  final DateTime? lastSchedulerEvaluatedAt;
  final String operatorAction;
  final num pausedSourceBindingCount;
  final num projected;
  final List<InterestSourceDailyHistoryProviderResponseDto> providerBreakdown;
  final InterestSourceDailyHistoryDayResponseDtoProviderHealthStateProviderHealthState
  providerHealthState;
  final num providerUnavailableScans;
  final num rateLimitedScans;
  final InterestSourceDailyHistoryDayResponseDtoScanCoverageStateScanCoverageState
  scanCoverageState;
  final num scannedSourceBindingCount;
  final num schedulerDecisionCount;
  final num schedulerEnqueuedCount;
  final InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto
  schedulerSkippedByReason;
  final num schedulerSkippedCount;
  final List<String> signals;
  final num skippedDuplicates;
  final num sourceBindingCount;
  final num succeededScans;
  final num totalScans;
  final num unconfiguredSourceBindingCount;
  final num unscannedSourceBindingCount;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() =>
      _$InterestSourceDailyHistoryDayResponseDtoToJson(this);
}
