// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_rating_lookup_target_dto.dart';

part 'list_post_ratings_request_dto.g.dart';

@JsonSerializable()
class ListPostRatingsRequestDto {
  const ListPostRatingsRequestDto({required this.targets});

  factory ListPostRatingsRequestDto.fromJson(Map<String, Object?> json) =>
      _$ListPostRatingsRequestDtoFromJson(json);

  final List<PostRatingLookupTargetDto> targets;

  Map<String, Object?> toJson() => _$ListPostRatingsRequestDtoToJson(this);
}
