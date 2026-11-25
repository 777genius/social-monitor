// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_post_ratings_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListPostRatingsRequestDto _$ListPostRatingsRequestDtoFromJson(
  Map<String, dynamic> json,
) => ListPostRatingsRequestDto(
  targets: (json['targets'] as List<dynamic>)
      .map((e) => PostRatingLookupTargetDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ListPostRatingsRequestDtoToJson(
  ListPostRatingsRequestDto instance,
) => <String, dynamic>{'targets': instance.targets};
