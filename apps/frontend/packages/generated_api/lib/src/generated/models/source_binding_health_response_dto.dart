// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_health_explanation_response_dto.dart';
import 'source_binding_health_freshness_response_dto.dart';
import 'source_binding_health_policy_response_dto.dart';
import 'source_binding_health_recent_window_response_dto.dart';
import 'source_binding_health_response_dto_health_state_health_state.dart';
import 'source_binding_health_scan_response_dto.dart';
import 'source_binding_health_scheduler_decision_response_dto.dart';
import 'source_binding_response_dto.dart';

part 'source_binding_health_response_dto.g.dart';

@JsonSerializable()
class SourceBindingHealthResponseDto {
  const SourceBindingHealthResponseDto({
    required this.evaluatedAt,
    required this.healthExplanation,
    required this.healthState,
    required this.operatorAction,
    required this.schedulerDecision,
    required this.sourceBinding,
    this.freshness,
    this.latestScan,
    this.recentWindow,
    this.scanPolicy,
  });

  factory SourceBindingHealthResponseDto.fromJson(Map<String, Object?> json) =>
      _$SourceBindingHealthResponseDtoFromJson(json);

  final DateTime evaluatedAt;
  final SourceBindingHealthFreshnessResponseDto? freshness;
  final SourceBindingHealthExplanationResponseDto healthExplanation;
  final SourceBindingHealthResponseDtoHealthStateHealthState healthState;
  final SourceBindingHealthScanResponseDto? latestScan;
  final String operatorAction;
  final SourceBindingHealthRecentWindowResponseDto? recentWindow;
  final SourceBindingHealthPolicyResponseDto? scanPolicy;
  final SourceBindingHealthSchedulerDecisionResponseDto schedulerDecision;
  final SourceBindingResponseDto sourceBinding;

  Map<String, Object?> toJson() => _$SourceBindingHealthResponseDtoToJson(this);
}
