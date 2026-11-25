// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'change_source_binding_status_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChangeSourceBindingStatusRequestDto
_$ChangeSourceBindingStatusRequestDtoFromJson(Map<String, dynamic> json) =>
    ChangeSourceBindingStatusRequestDto(
      status: ChangeSourceBindingStatusRequestDtoStatusStatus.fromJson(
        json['status'] as String,
      ),
    );

Map<String, dynamic> _$ChangeSourceBindingStatusRequestDtoToJson(
  ChangeSourceBindingStatusRequestDto instance,
) => <String, dynamic>{'status': instance.status};
