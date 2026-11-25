// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_daily_history_scheduler_skip_breakdown_response_dto.dart';
import 'source_binding_daily_scan_history_summary_response_dto_provider_health_state_provider_health_state.dart';

part 'source_binding_daily_scan_history_summary_response_dto.g.dart';

@JsonSerializable()
class SourceBindingDailyScanHistorySummaryResponseDto {
  const SourceBindingDailyScanHistorySummaryResponseDto({
    required this.activeScans,
    required this.consecutiveFailures,
    required this.daysWithFailures,
    required this.daysWithRateLimits,
    required this.daysWithScans,
    required this.failedScans,
    required this.fetched,
    required this.inserted,
    required this.operatorAction,
    required this.projected,
    required this.providerHealthState,
    required this.providerUnavailableScans,
    required this.rateLimitedScans,
    required this.schedulerDecisionCount,
    required this.schedulerEnqueuedCount,
    required this.schedulerSkippedByReason,
    required this.schedulerSkippedCount,
    required this.signals,
    required this.skippedDuplicates,
    required this.succeededScans,
    required this.totalScans,
    this.lastCompletedAt,
    this.lastScanRequestedAt,
    this.lastSchedulerEvaluatedAt,
  });

  factory SourceBindingDailyScanHistorySummaryResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingDailyScanHistorySummaryResponseDtoFromJson(json);

  final num activeScans;
  final num consecutiveFailures;
  final num daysWithFailures;
  final num daysWithRateLimits;
  final num daysWithScans;
  final num failedScans;
  final num fetched;
  final num inserted;
  final DateTime? lastCompletedAt;
  final DateTime? lastScanRequestedAt;
  final DateTime? lastSchedulerEvaluatedAt;
  final String operatorAction;
  final num projected;
  final SourceBindingDailyScanHistorySummaryResponseDtoProviderHealthStateProviderHealthState
  providerHealthState;
  final num providerUnavailableScans;
  final num rateLimitedScans;
  final num schedulerDecisionCount;
  final num schedulerEnqueuedCount;
  final SourceBindingDailyHistorySchedulerSkipBreakdownResponseDto
  schedulerSkippedByReason;
  final num schedulerSkippedCount;
  final List<String> signals;
  final num skippedDuplicates;
  final num succeededScans;
  final num totalScans;

  Map<String, Object?> toJson() =>
      _$SourceBindingDailyScanHistorySummaryResponseDtoToJson(this);
}
