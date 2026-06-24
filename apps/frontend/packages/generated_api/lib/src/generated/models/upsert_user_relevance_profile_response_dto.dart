// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user_relevance_profile_dto.dart';

part 'upsert_user_relevance_profile_response_dto.g.dart';

@JsonSerializable()
class UpsertUserRelevanceProfileResponseDto {
  const UpsertUserRelevanceProfileResponseDto({
    required this.created,
    required this.profile,
  });

  factory UpsertUserRelevanceProfileResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$UpsertUserRelevanceProfileResponseDtoFromJson(json);

  final bool created;
  final UserRelevanceProfileDto profile;

  Map<String, Object?> toJson() =>
      _$UpsertUserRelevanceProfileResponseDtoToJson(this);
}
