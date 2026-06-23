// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_scan_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestScanResponseDto _$RequestScanResponseDtoFromJson(
  Map<String, dynamic> json,
) => RequestScanResponseDto(
  created: json['created'] as bool,
  scanJobId: json['scanJobId'] as String,
  status: RequestScanResponseDtoStatusStatus.fromJson(json['status'] as String),
);

Map<String, dynamic> _$RequestScanResponseDtoToJson(
  RequestScanResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'scanJobId': instance.scanJobId,
  'status': instance.status,
};
