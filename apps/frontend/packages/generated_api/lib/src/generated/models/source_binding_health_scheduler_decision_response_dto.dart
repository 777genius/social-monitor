// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_health_scheduler_decision_response_dto_decision_decision.dart';

part 'source_binding_health_scheduler_decision_response_dto.g.dart';

@JsonSerializable()
class SourceBindingHealthSchedulerDecisionResponseDto {
  const SourceBindingHealthSchedulerDecisionResponseDto({
    required this.canScanNow,
    required this.decision,
    required this.minimumIntervalSeconds,
    required this.reason,
    required this.signals,
    this.configuredIntervalSeconds,
    this.effectiveIntervalSeconds,
    this.freshnessSeconds,
    this.nextEligibleAt,
    this.providerFailureBackoffUntil,
    this.providerMinimumIntervalEnforced,
    this.rateLimitBackoffUntil,
    this.waitSeconds,
  });

  factory SourceBindingHealthSchedulerDecisionResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingHealthSchedulerDecisionResponseDtoFromJson(json);

  final bool canScanNow;
  final num? configuredIntervalSeconds;
  final SourceBindingHealthSchedulerDecisionResponseDtoDecisionDecision
  decision;
  final num? effectiveIntervalSeconds;
  final num? freshnessSeconds;
  final num minimumIntervalSeconds;
  final DateTime? nextEligibleAt;
  final DateTime? providerFailureBackoffUntil;
  final bool? providerMinimumIntervalEnforced;
  final DateTime? rateLimitBackoffUntil;
  final String reason;
  final List<String> signals;
  final num? waitSeconds;

  Map<String, Object?> toJson() =>
      _$SourceBindingHealthSchedulerDecisionResponseDtoToJson(this);
}
