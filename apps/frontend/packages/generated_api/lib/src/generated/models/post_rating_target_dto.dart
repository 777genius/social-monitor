// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_rating_target_dto.g.dart';

@JsonSerializable()
class PostRatingTargetDto {
  const PostRatingTargetDto({
    required this.interestId,
    this.feedItemId,
    this.sourceItemId,
  });

  factory PostRatingTargetDto.fromJson(Map<String, Object?> json) =>
      _$PostRatingTargetDtoFromJson(json);

  final String? feedItemId;
  final String interestId;
  final String? sourceItemId;

  Map<String, Object?> toJson() => _$PostRatingTargetDtoToJson(this);
}
