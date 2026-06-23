// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_health_scan_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingHealthScanResponseDto _$SourceBindingHealthScanResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingHealthScanResponseDto(
  operatorAction: json['operatorAction'] as String,
  requestedAt: DateTime.parse(json['requestedAt'] as String),
  scanJobId: json['scanJobId'] as String,
  status: SourceBindingHealthScanResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  userState: SourceBindingHealthScanResponseDtoUserStateUserState.fromJson(
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
      : SourceBindingHealthScanResponseDtoFailureClassFailureClass.fromJson(
          json['failureClass'] as String,
        ),
  failureReason: json['failureReason'] as String?,
  latestAttempt: json['latestAttempt'] == null
      ? null
      : SourceBindingHealthAttemptResponseDto.fromJson(
          json['latestAttempt'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$SourceBindingHealthScanResponseDtoToJson(
  SourceBindingHealthScanResponseDto instance,
) => <String, dynamic>{
  'completedAt': instance.completedAt?.toIso8601String(),
  'enqueuedAt': instance.enqueuedAt?.toIso8601String(),
  'failureClass': instance.failureClass,
  'failureReason': instance.failureReason,
  'latestAttempt': instance.latestAttempt,
  'operatorAction': instance.operatorAction,
  'requestedAt': instance.requestedAt.toIso8601String(),
  'scanJobId': instance.scanJobId,
  'status': instance.status,
  'userState': instance.userState,
};
