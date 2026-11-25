// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bind_source_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BindSourceResponseDto _$BindSourceResponseDtoFromJson(
  Map<String, dynamic> json,
) => BindSourceResponseDto(
  created: json['created'] as bool,
  sourceBindingId: json['sourceBindingId'] as String,
);

Map<String, dynamic> _$BindSourceResponseDtoToJson(
  BindSourceResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'sourceBindingId': instance.sourceBindingId,
};
