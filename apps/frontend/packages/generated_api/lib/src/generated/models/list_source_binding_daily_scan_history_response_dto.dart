// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'list_source_binding_daily_scan_history_response_dto_source_binding_status_source_binding_status.dart';
import 'scan_policy_cadence_response_dto.dart';
import 'source_binding_daily_scan_history_day_response_dto.dart';
import 'source_binding_daily_scan_history_summary_response_dto.dart';

part 'list_source_binding_daily_scan_history_response_dto.g.dart';

@JsonSerializable()
class ListSourceBindingDailyScanHistoryResponseDto {
  const ListSourceBindingDailyScanHistoryResponseDto({
    required this.days,
    required this.interestId,
    required this.maxScanJobs,
    required this.providerKey,
    required this.sourceBindingId,
    required this.sourceBindingStatus,
    required this.truncated,
    required this.windowEndedAt,
    required this.windowStartedAt,
    this.cadence,
    this.summary,
  });

  factory ListSourceBindingDailyScanHistoryResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ListSourceBindingDailyScanHistoryResponseDtoFromJson(json);

  final ScanPolicyCadenceResponseDto? cadence;
  final List<SourceBindingDailyScanHistoryDayResponseDto> days;
  final String interestId;
  final num maxScanJobs;
  final String providerKey;
  final String sourceBindingId;
  final ListSourceBindingDailyScanHistoryResponseDtoSourceBindingStatusSourceBindingStatus
  sourceBindingStatus;
  final SourceBindingDailyScanHistorySummaryResponseDto? summary;
  final bool truncated;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() =>
      _$ListSourceBindingDailyScanHistoryResponseDtoToJson(this);
}
