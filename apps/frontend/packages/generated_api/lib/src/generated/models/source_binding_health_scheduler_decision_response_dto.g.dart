// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_health_scheduler_decision_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingHealthSchedulerDecisionResponseDto
_$SourceBindingHealthSchedulerDecisionResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingHealthSchedulerDecisionResponseDto(
  canScanNow: json['canScanNow'] as bool,
  decision:
      SourceBindingHealthSchedulerDecisionResponseDtoDecisionDecision.fromJson(
        json['decision'] as String,
      ),
  minimumIntervalSeconds: json['minimumIntervalSeconds'] as num,
  reason: json['reason'] as String,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  configuredIntervalSeconds: json['configuredIntervalSeconds'] as num?,
  effectiveIntervalSeconds: json['effectiveIntervalSeconds'] as num?,
  freshnessSeconds: json['freshnessSeconds'] as num?,
  nextEligibleAt: json['nextEligibleAt'] == null
      ? null
      : DateTime.parse(json['nextEligibleAt'] as String),
  providerFailureBackoffUntil: json['providerFailureBackoffUntil'] == null
      ? null
      : DateTime.parse(json['providerFailureBackoffUntil'] as String),
  providerMinimumIntervalEnforced:
      json['providerMinimumIntervalEnforced'] as bool?,
  rateLimitBackoffUntil: json['rateLimitBackoffUntil'] == null
      ? null
      : DateTime.parse(json['rateLimitBackoffUntil'] as String),
  waitSeconds: json['waitSeconds'] as num?,
);

Map<String, dynamic> _$SourceBindingHealthSchedulerDecisionResponseDtoToJson(
  SourceBindingHealthSchedulerDecisionResponseDto instance,
) => <String, dynamic>{
  'canScanNow': instance.canScanNow,
  'configuredIntervalSeconds': instance.configuredIntervalSeconds,
  'decision': instance.decision,
  'effectiveIntervalSeconds': instance.effectiveIntervalSeconds,
  'freshnessSeconds': instance.freshnessSeconds,
  'minimumIntervalSeconds': instance.minimumIntervalSeconds,
  'nextEligibleAt': instance.nextEligibleAt?.toIso8601String(),
  'providerFailureBackoffUntil': instance.providerFailureBackoffUntil
      ?.toIso8601String(),
  'providerMinimumIntervalEnforced': instance.providerMinimumIntervalEnforced,
  'rateLimitBackoffUntil': instance.rateLimitBackoffUntil?.toIso8601String(),
  'reason': instance.reason,
  'signals': instance.signals,
  'waitSeconds': instance.waitSeconds,
};
