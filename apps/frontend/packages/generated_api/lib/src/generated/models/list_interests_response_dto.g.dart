// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_interests_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListInterestsResponseDto _$ListInterestsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListInterestsResponseDto(
  interests: (json['interests'] as List<dynamic>)
      .map((e) => InterestResponseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListInterestsResponseDtoToJson(
  ListInterestsResponseDto instance,
) => <String, dynamic>{
  'interests': instance.interests,
  'nextCursor': instance.nextCursor,
};
