// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_daily_scan_history_day_response_dto_provider_health_state_provider_health_state.dart';

part 'source_binding_daily_scan_history_day_response_dto.g.dart';

@JsonSerializable()
class SourceBindingDailyScanHistoryDayResponseDto {
  const SourceBindingDailyScanHistoryDayResponseDto({
    required this.activeScans,
    required this.consecutiveFailures,
    required this.date,
    required this.failedScans,
    required this.fetched,
    required this.inserted,
    required this.operatorAction,
    required this.projected,
    required this.providerHealthState,
    required this.providerUnavailableScans,
    required this.rateLimitedScans,
    required this.signals,
    required this.skippedDuplicates,
    required this.succeededScans,
    required this.totalScans,
    required this.windowEndedAt,
    required this.windowStartedAt,
    this.lastCompletedAt,
    this.lastScanRequestedAt,
  });

  factory SourceBindingDailyScanHistoryDayResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingDailyScanHistoryDayResponseDtoFromJson(json);

  final num activeScans;
  final num consecutiveFailures;
  final String date;
  final num failedScans;
  final num fetched;
  final num inserted;
  final DateTime? lastCompletedAt;
  final DateTime? lastScanRequestedAt;
  final String operatorAction;
  final num projected;
  final SourceBindingDailyScanHistoryDayResponseDtoProviderHealthStateProviderHealthState
  providerHealthState;
  final num providerUnavailableScans;
  final num rateLimitedScans;
  final List<String> signals;
  final num skippedDuplicates;
  final num succeededScans;
  final num totalScans;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() =>
      _$SourceBindingDailyScanHistoryDayResponseDtoToJson(this);
}
