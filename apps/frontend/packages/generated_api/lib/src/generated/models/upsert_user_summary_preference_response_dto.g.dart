// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upsert_user_summary_preference_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpsertUserSummaryPreferenceResponseDto
_$UpsertUserSummaryPreferenceResponseDtoFromJson(Map<String, dynamic> json) =>
    UpsertUserSummaryPreferenceResponseDto(
      created: json['created'] as bool,
      summaryPreference: UserSummaryPreferenceViewDto.fromJson(
        json['summaryPreference'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$UpsertUserSummaryPreferenceResponseDtoToJson(
  UpsertUserSummaryPreferenceResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'summaryPreference': instance.summaryPreference,
};
