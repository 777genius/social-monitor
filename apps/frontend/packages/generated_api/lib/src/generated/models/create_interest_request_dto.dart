// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_interest_request_dto.g.dart';

@JsonSerializable()
class CreateInterestRequestDto {
  const CreateInterestRequestDto({required this.name, required this.query});

  factory CreateInterestRequestDto.fromJson(Map<String, Object?> json) =>
      _$CreateInterestRequestDtoFromJson(json);

  final String name;
  final String query;

  Map<String, Object?> toJson() => _$CreateInterestRequestDtoToJson(this);
}
