// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_interest_response_dto.g.dart';

@JsonSerializable()
class CreateInterestResponseDto {
  const CreateInterestResponseDto({
    required this.created,
    required this.interestId,
  });

  factory CreateInterestResponseDto.fromJson(Map<String, Object?> json) =>
      _$CreateInterestResponseDtoFromJson(json);

  final bool created;
  final String interestId;

  Map<String, Object?> toJson() => _$CreateInterestResponseDtoToJson(this);
}
