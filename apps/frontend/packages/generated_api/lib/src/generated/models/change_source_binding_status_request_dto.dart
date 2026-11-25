// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'change_source_binding_status_request_dto_status_status.dart';

part 'change_source_binding_status_request_dto.g.dart';

@JsonSerializable()
class ChangeSourceBindingStatusRequestDto {
  const ChangeSourceBindingStatusRequestDto({required this.status});

  factory ChangeSourceBindingStatusRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$ChangeSourceBindingStatusRequestDtoFromJson(json);

  final ChangeSourceBindingStatusRequestDtoStatusStatus status;

  Map<String, Object?> toJson() =>
      _$ChangeSourceBindingStatusRequestDtoToJson(this);
}
