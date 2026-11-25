// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_profile_health_dto_state_state.dart';

part 'source_profile_health_dto.g.dart';

@JsonSerializable()
class SourceProfileHealthDto {
  const SourceProfileHealthDto({
    required this.message,
    required this.reasonCode,
    required this.signals,
    required this.state,
  });

  factory SourceProfileHealthDto.fromJson(Map<String, Object?> json) =>
      _$SourceProfileHealthDtoFromJson(json);

  final String message;
  final String reasonCode;
  final List<String> signals;
  final SourceProfileHealthDtoStateState state;

  Map<String, Object?> toJson() => _$SourceProfileHealthDtoToJson(this);
}
