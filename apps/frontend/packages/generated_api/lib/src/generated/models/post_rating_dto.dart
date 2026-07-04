// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_rating_dto_learning_effect_learning_effect.dart';
import 'post_rating_dto_reason_reason.dart';
import 'post_rating_target_dto.dart';

part 'post_rating_dto.g.dart';

@JsonSerializable()
class PostRatingDto {
  const PostRatingDto({
    required this.feedbackId,
    required this.learningEffect,
    required this.ratedAt,
    required this.rating,
    required this.target,
    required this.userId,
    this.reason,
  });

  factory PostRatingDto.fromJson(Map<String, Object?> json) =>
      _$PostRatingDtoFromJson(json);

  final String feedbackId;
  final PostRatingDtoLearningEffectLearningEffect learningEffect;
  final DateTime ratedAt;
  final num rating;
  final PostRatingDtoReasonReason? reason;
  final PostRatingTargetDto target;
  final String userId;

  Map<String, Object?> toJson() => _$PostRatingDtoToJson(this);
}
