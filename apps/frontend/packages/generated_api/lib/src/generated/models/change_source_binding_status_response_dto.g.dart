// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'change_source_binding_status_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChangeSourceBindingStatusResponseDto
_$ChangeSourceBindingStatusResponseDtoFromJson(Map<String, dynamic> json) =>
    ChangeSourceBindingStatusResponseDto(
      changed: json['changed'] as bool,
      sourceBindingId: json['sourceBindingId'] as String,
      status: ChangeSourceBindingStatusResponseDtoStatusStatus.fromJson(
        json['status'] as String,
      ),
    );

Map<String, dynamic> _$ChangeSourceBindingStatusResponseDtoToJson(
  ChangeSourceBindingStatusResponseDto instance,
) => <String, dynamic>{
  'changed': instance.changed,
  'sourceBindingId': instance.sourceBindingId,
  'status': instance.status,
};
