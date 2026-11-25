// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_scan_policy_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetScanPolicyResponseDto _$SetScanPolicyResponseDtoFromJson(
  Map<String, dynamic> json,
) => SetScanPolicyResponseDto(
  created: json['created'] as bool,
  scanPolicyId: json['scanPolicyId'] as String,
  updated: json['updated'] as bool,
);

Map<String, dynamic> _$SetScanPolicyResponseDtoToJson(
  SetScanPolicyResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'scanPolicyId': instance.scanPolicyId,
  'updated': instance.updated,
};
