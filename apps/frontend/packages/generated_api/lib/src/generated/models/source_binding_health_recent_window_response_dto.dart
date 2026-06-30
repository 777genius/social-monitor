// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_health_recent_window_response_dto_provider_health_state_provider_health_state.dart';

part 'source_binding_health_recent_window_response_dto.g.dart';

@JsonSerializable()
class SourceBindingHealthRecentWindowResponseDto {
  const SourceBindingHealthRecentWindowResponseDto({
    required this.activeScans,
    required this.authFailedScans,
    required this.consecutiveFailures,
    required this.failedScans,
    required this.operatorAction,
    required this.providerHealthState,
    required this.providerUnavailableScans,
    required this.rateLimitedScans,
    required this.signals,
    required this.succeededScans,
    required this.totalScans,
    required this.windowEndedAt,
    required this.windowStartedAt,
    this.lastFailedAt,
    this.lastSucceededAt,
  });

  factory SourceBindingHealthRecentWindowResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingHealthRecentWindowResponseDtoFromJson(json);

  final num activeScans;
  final num authFailedScans;
  final num consecutiveFailures;
  final num failedScans;
  final DateTime? lastFailedAt;
  final DateTime? lastSucceededAt;
  final String operatorAction;
  final SourceBindingHealthRecentWindowResponseDtoProviderHealthStateProviderHealthState
  providerHealthState;
  final num providerUnavailableScans;
  final num rateLimitedScans;
  final List<String> signals;
  final num succeededScans;
  final num totalScans;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() =>
      _$SourceBindingHealthRecentWindowResponseDtoToJson(this);
}
