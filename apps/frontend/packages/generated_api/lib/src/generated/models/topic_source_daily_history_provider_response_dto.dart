// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'topic_source_daily_history_cadence_summary_response_dto.dart';
import 'topic_source_daily_history_provider_response_dto_provider_health_state_provider_health_state.dart';

part 'topic_source_daily_history_provider_response_dto.g.dart';

@JsonSerializable()
class TopicSourceDailyHistoryProviderResponseDto {
  const TopicSourceDailyHistoryProviderResponseDto({
    required this.activeScans,
    required this.configuredSourceBindingCount,
    required this.consecutiveFailures,
    required this.enabledSourceBindingCount,
    required this.failedScans,
    required this.fetched,
    required this.inserted,
    required this.operatorAction,
    required this.pausedSourceBindingCount,
    required this.projected,
    required this.providerHealthState,
    required this.providerKey,
    required this.providerUnavailableScans,
    required this.rateLimitedScans,
    required this.signals,
    required this.skippedDuplicates,
    required this.sourceBindingCount,
    required this.succeededScans,
    required this.totalScans,
    required this.unconfiguredSourceBindingCount,
    this.cadenceSummary,
    this.lastCompletedAt,
    this.lastScanRequestedAt,
  });

  factory TopicSourceDailyHistoryProviderResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$TopicSourceDailyHistoryProviderResponseDtoFromJson(json);

  final num activeScans;
  final TopicSourceDailyHistoryCadenceSummaryResponseDto? cadenceSummary;
  final num configuredSourceBindingCount;
  final num consecutiveFailures;
  final num enabledSourceBindingCount;
  final num failedScans;
  final num fetched;
  final num inserted;
  final DateTime? lastCompletedAt;
  final DateTime? lastScanRequestedAt;
  final String operatorAction;
  final num pausedSourceBindingCount;
  final num projected;
  final TopicSourceDailyHistoryProviderResponseDtoProviderHealthStateProviderHealthState
  providerHealthState;
  final String providerKey;
  final num providerUnavailableScans;
  final num rateLimitedScans;
  final List<String> signals;
  final num skippedDuplicates;
  final num sourceBindingCount;
  final num succeededScans;
  final num totalScans;
  final num unconfiguredSourceBindingCount;

  Map<String, Object?> toJson() =>
      _$TopicSourceDailyHistoryProviderResponseDtoToJson(this);
}
