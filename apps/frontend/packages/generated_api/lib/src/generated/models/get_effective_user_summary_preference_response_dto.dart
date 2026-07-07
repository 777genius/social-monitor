// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'get_effective_user_summary_preference_response_dto_source_source.dart';
import 'user_summary_preference_view_dto.dart';

part 'get_effective_user_summary_preference_response_dto.g.dart';

@JsonSerializable()
class GetEffectiveUserSummaryPreferenceResponseDto {
  const GetEffectiveUserSummaryPreferenceResponseDto({
    required this.source,
    this.summaryPreference,
  });

  factory GetEffectiveUserSummaryPreferenceResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$GetEffectiveUserSummaryPreferenceResponseDtoFromJson(json);

  final GetEffectiveUserSummaryPreferenceResponseDtoSourceSource source;
  final UserSummaryPreferenceViewDto? summaryPreference;

  Map<String, Object?> toJson() =>
      _$GetEffectiveUserSummaryPreferenceResponseDtoToJson(this);
}
