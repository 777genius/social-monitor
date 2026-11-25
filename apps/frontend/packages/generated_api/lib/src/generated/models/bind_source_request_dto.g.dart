// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bind_source_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BindSourceRequestDto _$BindSourceRequestDtoFromJson(
  Map<String, dynamic> json,
) => BindSourceRequestDto(
  providerKey: json['providerKey'] as String,
  config: json['config'],
);

Map<String, dynamic> _$BindSourceRequestDtoToJson(
  BindSourceRequestDto instance,
) => <String, dynamic>{
  'config': instance.config,
  'providerKey': instance.providerKey,
};
