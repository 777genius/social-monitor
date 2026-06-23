// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_health_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingHealthResponseDto _$SourceBindingHealthResponseDtoFromJson(
  Map<String, dynamic> json,
) => SourceBindingHealthResponseDto(
  evaluatedAt: DateTime.parse(json['evaluatedAt'] as String),
  healthState: SourceBindingHealthResponseDtoHealthStateHealthState.fromJson(
    json['healthState'] as String,
  ),
  operatorAction: json['operatorAction'] as String,
  sourceBinding: SourceBindingResponseDto.fromJson(
    json['sourceBinding'] as Map<String, dynamic>,
  ),
  freshness: json['freshness'] == null
      ? null
      : SourceBindingHealthFreshnessResponseDto.fromJson(
          json['freshness'] as Map<String, dynamic>,
        ),
  latestScan: json['latestScan'] == null
      ? null
      : SourceBindingHealthScanResponseDto.fromJson(
          json['latestScan'] as Map<String, dynamic>,
        ),
  scanPolicy: json['scanPolicy'] == null
      ? null
      : SourceBindingHealthPolicyResponseDto.fromJson(
          json['scanPolicy'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$SourceBindingHealthResponseDtoToJson(
  SourceBindingHealthResponseDto instance,
) => <String, dynamic>{
  'evaluatedAt': instance.evaluatedAt.toIso8601String(),
  'freshness': instance.freshness,
  'healthState': instance.healthState,
  'latestScan': instance.latestScan,
  'operatorAction': instance.operatorAction,
  'scanPolicy': instance.scanPolicy,
  'sourceBinding': instance.sourceBinding,
};
