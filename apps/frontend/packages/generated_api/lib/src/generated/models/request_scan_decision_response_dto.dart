// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'request_scan_decision_response_dto_decision_decision.dart';
import 'request_scan_decision_response_dto_provider_health_state_provider_health_state.dart';

part 'request_scan_decision_response_dto.g.dart';

@JsonSerializable()
class RequestScanDecisionResponseDto {
  const RequestScanDecisionResponseDto({
    required this.createdNewScan,
    required this.decision,
    required this.reason,
    required this.signals,
    this.configuredIntervalSeconds,
    this.effectiveIntervalSeconds,
    this.freshnessDeadlineAt,
    this.freshnessSeconds,
    this.minimumIntervalSeconds,
    this.nextEligibleAt,
    this.providerFailureBackoffUntil,
    this.providerHealthState,
    this.providerMinimumIntervalEnforced,
    this.rateLimitBackoffUntil,
    this.waitSeconds,
  });

  factory RequestScanDecisionResponseDto.fromJson(Map<String, Object?> json) =>
      _$RequestScanDecisionResponseDtoFromJson(json);

  final num? configuredIntervalSeconds;
  final bool createdNewScan;
  final RequestScanDecisionResponseDtoDecisionDecision decision;
  final num? effectiveIntervalSeconds;
  final DateTime? freshnessDeadlineAt;
  final num? freshnessSeconds;
  final num? minimumIntervalSeconds;
  final DateTime? nextEligibleAt;
  final DateTime? providerFailureBackoffUntil;
  final RequestScanDecisionResponseDtoProviderHealthStateProviderHealthState?
  providerHealthState;
  final bool? providerMinimumIntervalEnforced;
  final DateTime? rateLimitBackoffUntil;
  final String reason;
  final List<String> signals;
  final num? waitSeconds;

  Map<String, Object?> toJson() => _$RequestScanDecisionResponseDtoToJson(this);
}
