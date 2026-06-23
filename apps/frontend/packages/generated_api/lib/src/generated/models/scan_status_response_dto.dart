// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_execution_attempt_response_dto.dart';
import 'scan_status_response_dto_failure_class_failure_class.dart';
import 'scan_status_response_dto_status_status.dart';
import 'scan_status_response_dto_user_state_user_state.dart';

part 'scan_status_response_dto.g.dart';

@JsonSerializable()
class ScanStatusResponseDto {
  const ScanStatusResponseDto({
    required this.operatorAction,
    required this.requestedAt,
    required this.scanJobId,
    required this.scanPolicyId,
    required this.sourceBindingId,
    required this.status,
    required this.userState,
    this.completedAt,
    this.enqueuedAt,
    this.failureClass,
    this.failureReason,
    this.latestAttempt,
  });

  factory ScanStatusResponseDto.fromJson(Map<String, Object?> json) =>
      _$ScanStatusResponseDtoFromJson(json);

  final DateTime? completedAt;
  final DateTime? enqueuedAt;
  final ScanStatusResponseDtoFailureClassFailureClass? failureClass;
  final String? failureReason;
  final ScanExecutionAttemptResponseDto? latestAttempt;
  final String operatorAction;
  final DateTime requestedAt;
  final String scanJobId;
  final String scanPolicyId;
  final String sourceBindingId;
  final ScanStatusResponseDtoStatusStatus status;
  final ScanStatusResponseDtoUserStateUserState userState;

  Map<String, Object?> toJson() => _$ScanStatusResponseDtoToJson(this);
}
