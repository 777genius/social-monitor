// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_rating_lookup_target_dto.g.dart';

@JsonSerializable()
class PostRatingLookupTargetDto {
  const PostRatingLookupTargetDto({
    required this.interestId,
    this.feedItemId,
    this.sourceItemId,
  });

  factory PostRatingLookupTargetDto.fromJson(Map<String, Object?> json) =>
      _$PostRatingLookupTargetDtoFromJson(json);

  final String? feedItemId;
  final String interestId;
  final String? sourceItemId;

  Map<String, Object?> toJson() => _$PostRatingLookupTargetDtoToJson(this);
}
