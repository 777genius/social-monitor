// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user_summary_preference_view_dto.dart';

part 'upsert_user_summary_preference_response_dto.g.dart';

@JsonSerializable()
class UpsertUserSummaryPreferenceResponseDto {
  const UpsertUserSummaryPreferenceResponseDto({
    required this.created,
    required this.summaryPreference,
  });

  factory UpsertUserSummaryPreferenceResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$UpsertUserSummaryPreferenceResponseDtoFromJson(json);

  final bool created;
  final UserSummaryPreferenceViewDto summaryPreference;

  Map<String, Object?> toJson() =>
      _$UpsertUserSummaryPreferenceResponseDtoToJson(this);
}
