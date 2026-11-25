// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'interest_response_dto.dart';

part 'list_interests_response_dto.g.dart';

@JsonSerializable()
class ListInterestsResponseDto {
  const ListInterestsResponseDto({required this.interests, this.nextCursor});

  factory ListInterestsResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListInterestsResponseDtoFromJson(json);

  final List<InterestResponseDto> interests;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$ListInterestsResponseDtoToJson(this);
}
