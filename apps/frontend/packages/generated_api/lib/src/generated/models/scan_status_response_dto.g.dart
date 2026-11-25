// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_status_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanStatusResponseDto _$ScanStatusResponseDtoFromJson(
  Map<String, dynamic> json,
) => ScanStatusResponseDto(
  operatorAction: json['operatorAction'] as String,
  requestedAt: DateTime.parse(json['requestedAt'] as String),
  scanJobId: json['scanJobId'] as String,
  scanPolicyId: json['scanPolicyId'] as String,
  sourceBindingId: json['sourceBindingId'] as String,
  status: ScanStatusResponseDtoStatusStatus.fromJson(json['status'] as String),
  userState: ScanStatusResponseDtoUserStateUserState.fromJson(
    json['userState'] as String,
  ),
  completedAt: json['completedAt'] == null
      ? null
      : DateTime.parse(json['completedAt'] as String),
  enqueuedAt: json['enqueuedAt'] == null
      ? null
      : DateTime.parse(json['enqueuedAt'] as String),
  failureClass: json['failureClass'] == null
      ? null
      : ScanStatusResponseDtoFailureClassFailureClass.fromJson(
          json['failureClass'] as String,
        ),
  failureReason: json['failureReason'] as String?,
  latestAttempt: json['latestAttempt'] == null
      ? null
      : ScanExecutionAttemptResponseDto.fromJson(
          json['latestAttempt'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$ScanStatusResponseDtoToJson(
  ScanStatusResponseDto instance,
) => <String, dynamic>{
  'completedAt': instance.completedAt?.toIso8601String(),
  'enqueuedAt': instance.enqueuedAt?.toIso8601String(),
  'failureClass': instance.failureClass,
  'failureReason': instance.failureReason,
  'latestAttempt': instance.latestAttempt,
  'operatorAction': instance.operatorAction,
  'requestedAt': instance.requestedAt.toIso8601String(),
  'scanJobId': instance.scanJobId,
  'scanPolicyId': instance.scanPolicyId,
  'sourceBindingId': instance.sourceBindingId,
  'status': instance.status,
  'userState': instance.userState,
};
