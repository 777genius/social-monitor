// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bind_source_response_dto.g.dart';

@JsonSerializable()
class BindSourceResponseDto {
  const BindSourceResponseDto({
    required this.created,
    required this.sourceBindingId,
  });

  factory BindSourceResponseDto.fromJson(Map<String, Object?> json) =>
      _$BindSourceResponseDtoFromJson(json);

  final bool created;
  final String sourceBindingId;

  Map<String, Object?> toJson() => _$BindSourceResponseDtoToJson(this);
}
