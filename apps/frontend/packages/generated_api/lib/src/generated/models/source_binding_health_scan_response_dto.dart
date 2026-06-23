// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_health_attempt_response_dto.dart';
import 'source_binding_health_scan_response_dto_failure_class_failure_class.dart';
import 'source_binding_health_scan_response_dto_status_status.dart';
import 'source_binding_health_scan_response_dto_user_state_user_state.dart';

part 'source_binding_health_scan_response_dto.g.dart';

@JsonSerializable()
class SourceBindingHealthScanResponseDto {
  const SourceBindingHealthScanResponseDto({
    required this.operatorAction,
    required this.requestedAt,
    required this.scanJobId,
    required this.status,
    required this.userState,
    this.completedAt,
    this.enqueuedAt,
    this.failureClass,
    this.failureReason,
    this.latestAttempt,
  });

  factory SourceBindingHealthScanResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingHealthScanResponseDtoFromJson(json);

  final DateTime? completedAt;
  final DateTime? enqueuedAt;
  final SourceBindingHealthScanResponseDtoFailureClassFailureClass?
  failureClass;
  final String? failureReason;
  final SourceBindingHealthAttemptResponseDto? latestAttempt;
  final String operatorAction;
  final DateTime requestedAt;
  final String scanJobId;
  final SourceBindingHealthScanResponseDtoStatusStatus status;
  final SourceBindingHealthScanResponseDtoUserStateUserState userState;

  Map<String, Object?> toJson() =>
      _$SourceBindingHealthScanResponseDtoToJson(this);
}
