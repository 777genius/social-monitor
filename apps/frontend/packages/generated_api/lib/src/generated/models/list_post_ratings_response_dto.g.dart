// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_post_ratings_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListPostRatingsResponseDto _$ListPostRatingsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListPostRatingsResponseDto(
  ratings: (json['ratings'] as List<dynamic>)
      .map((e) => PostRatingDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ListPostRatingsResponseDtoToJson(
  ListPostRatingsResponseDto instance,
) => <String, dynamic>{'ratings': instance.ratings};
