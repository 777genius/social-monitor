// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_profile_health_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceProfileHealthDto _$SourceProfileHealthDtoFromJson(
  Map<String, dynamic> json,
) => SourceProfileHealthDto(
  message: json['message'] as String,
  reasonCode: json['reasonCode'] as String,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  state: SourceProfileHealthDtoStateState.fromJson(json['state'] as String),
);

Map<String, dynamic> _$SourceProfileHealthDtoToJson(
  SourceProfileHealthDto instance,
) => <String, dynamic>{
  'message': instance.message,
  'reasonCode': instance.reasonCode,
  'signals': instance.signals,
  'state': instance.state,
};
