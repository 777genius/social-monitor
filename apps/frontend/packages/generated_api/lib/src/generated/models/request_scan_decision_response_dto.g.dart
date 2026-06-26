// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_scan_decision_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestScanDecisionResponseDto _$RequestScanDecisionResponseDtoFromJson(
  Map<String, dynamic> json,
) => RequestScanDecisionResponseDto(
  createdNewScan: json['createdNewScan'] as bool,
  decision: RequestScanDecisionResponseDtoDecisionDecision.fromJson(
    json['decision'] as String,
  ),
  reason: json['reason'] as String,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  configuredIntervalSeconds: json['configuredIntervalSeconds'] as num?,
  effectiveIntervalSeconds: json['effectiveIntervalSeconds'] as num?,
  freshnessDeadlineAt: json['freshnessDeadlineAt'] == null
      ? null
      : DateTime.parse(json['freshnessDeadlineAt'] as String),
  freshnessSeconds: json['freshnessSeconds'] as num?,
  minimumIntervalSeconds: json['minimumIntervalSeconds'] as num?,
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

Map<String, dynamic> _$RequestScanDecisionResponseDtoToJson(
  RequestScanDecisionResponseDto instance,
) => <String, dynamic>{
  'configuredIntervalSeconds': instance.configuredIntervalSeconds,
  'createdNewScan': instance.createdNewScan,
  'decision': instance.decision,
  'effectiveIntervalSeconds': instance.effectiveIntervalSeconds,
  'freshnessDeadlineAt': instance.freshnessDeadlineAt?.toIso8601String(),
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
