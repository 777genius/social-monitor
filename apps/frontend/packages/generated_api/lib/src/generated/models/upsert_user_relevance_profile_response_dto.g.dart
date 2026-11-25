// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upsert_user_relevance_profile_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpsertUserRelevanceProfileResponseDto
_$UpsertUserRelevanceProfileResponseDtoFromJson(Map<String, dynamic> json) =>
    UpsertUserRelevanceProfileResponseDto(
      created: json['created'] as bool,
      profile: UserRelevanceProfileDto.fromJson(
        json['profile'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$UpsertUserRelevanceProfileResponseDtoToJson(
  UpsertUserRelevanceProfileResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'profile': instance.profile,
};
