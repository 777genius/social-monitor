// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'change_source_binding_status_response_dto_status_status.dart';

part 'change_source_binding_status_response_dto.g.dart';

@JsonSerializable()
class ChangeSourceBindingStatusResponseDto {
  const ChangeSourceBindingStatusResponseDto({
    required this.changed,
    required this.sourceBindingId,
    required this.status,
  });

  factory ChangeSourceBindingStatusResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ChangeSourceBindingStatusResponseDtoFromJson(json);

  final bool changed;
  final String sourceBindingId;
  final ChangeSourceBindingStatusResponseDtoStatusStatus status;

  Map<String, Object?> toJson() =>
      _$ChangeSourceBindingStatusResponseDtoToJson(this);
}
