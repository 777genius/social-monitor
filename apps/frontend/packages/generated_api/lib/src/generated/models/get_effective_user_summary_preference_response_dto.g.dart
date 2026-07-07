// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'get_effective_user_summary_preference_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GetEffectiveUserSummaryPreferenceResponseDto
_$GetEffectiveUserSummaryPreferenceResponseDtoFromJson(
  Map<String, dynamic> json,
) => GetEffectiveUserSummaryPreferenceResponseDto(
  source: GetEffectiveUserSummaryPreferenceResponseDtoSourceSource.fromJson(
    json['source'] as String,
  ),
  summaryPreference: json['summaryPreference'] == null
      ? null
      : UserSummaryPreferenceViewDto.fromJson(
          json['summaryPreference'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$GetEffectiveUserSummaryPreferenceResponseDtoToJson(
  GetEffectiveUserSummaryPreferenceResponseDto instance,
) => <String, dynamic>{
  'source': instance.source,
  'summaryPreference': instance.summaryPreference,
};
