// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'request_scan_decision_response_dto_decision_decision.dart';

part 'request_scan_decision_response_dto.g.dart';

@JsonSerializable()
class RequestScanDecisionResponseDto {
  const RequestScanDecisionResponseDto({
    required this.createdNewScan,
    required this.decision,
    required this.reason,
    required this.signals,
    this.freshnessDeadlineAt,
    this.nextEligibleAt,
    this.rateLimitBackoffUntil,
    this.waitSeconds,
  });

  factory RequestScanDecisionResponseDto.fromJson(Map<String, Object?> json) =>
      _$RequestScanDecisionResponseDtoFromJson(json);

  final bool createdNewScan;
  final RequestScanDecisionResponseDtoDecisionDecision decision;
  final DateTime? freshnessDeadlineAt;
  final DateTime? nextEligibleAt;
  final DateTime? rateLimitBackoffUntil;
  final String reason;
  final List<String> signals;
  final num? waitSeconds;

  Map<String, Object?> toJson() => _$RequestScanDecisionResponseDtoToJson(this);
}
