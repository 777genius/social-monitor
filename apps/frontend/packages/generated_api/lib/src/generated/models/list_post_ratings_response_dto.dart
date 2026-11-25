// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_rating_dto.dart';

part 'list_post_ratings_response_dto.g.dart';

@JsonSerializable()
class ListPostRatingsResponseDto {
  const ListPostRatingsResponseDto({required this.ratings});

  factory ListPostRatingsResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListPostRatingsResponseDtoFromJson(json);

  final List<PostRatingDto> ratings;

  Map<String, Object?> toJson() => _$ListPostRatingsResponseDtoToJson(this);
}
