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
  freshnessDeadlineAt: json['freshnessDeadlineAt'] == null
      ? null
      : DateTime.parse(json['freshnessDeadlineAt'] as String),
  nextEligibleAt: json['nextEligibleAt'] == null
      ? null
      : DateTime.parse(json['nextEligibleAt'] as String),
  rateLimitBackoffUntil: json['rateLimitBackoffUntil'] == null
      ? null
      : DateTime.parse(json['rateLimitBackoffUntil'] as String),
  waitSeconds: json['waitSeconds'] as num?,
);

Map<String, dynamic> _$RequestScanDecisionResponseDtoToJson(
  RequestScanDecisionResponseDto instance,
) => <String, dynamic>{
  'createdNewScan': instance.createdNewScan,
  'decision': instance.decision,
  'freshnessDeadlineAt': instance.freshnessDeadlineAt?.toIso8601String(),
  'nextEligibleAt': instance.nextEligibleAt?.toIso8601String(),
  'rateLimitBackoffUntil': instance.rateLimitBackoffUntil?.toIso8601String(),
  'reason': instance.reason,
  'signals': instance.signals,
  'waitSeconds': instance.waitSeconds,
};
