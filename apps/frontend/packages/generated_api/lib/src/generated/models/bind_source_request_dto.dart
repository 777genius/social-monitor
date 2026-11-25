// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bind_source_request_dto.g.dart';

@JsonSerializable()
class BindSourceRequestDto {
  const BindSourceRequestDto({required this.providerKey, this.config});

  factory BindSourceRequestDto.fromJson(Map<String, Object?> json) =>
      _$BindSourceRequestDtoFromJson(json);

  final dynamic config;
  final String providerKey;

  Map<String, Object?> toJson() => _$BindSourceRequestDtoToJson(this);
}
