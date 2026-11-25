// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_rating_dto.dart';
import 'record_post_rating_response_dto_learning_direction_learning_direction.dart';

part 'record_post_rating_response_dto.g.dart';

@JsonSerializable()
class RecordPostRatingResponseDto {
  const RecordPostRatingResponseDto({
    required this.created,
    required this.learningDirection,
    required this.rating,
  });

  factory RecordPostRatingResponseDto.fromJson(Map<String, Object?> json) =>
      _$RecordPostRatingResponseDtoFromJson(json);

  final bool created;
  final RecordPostRatingResponseDtoLearningDirectionLearningDirection
  learningDirection;
  final PostRatingDto rating;

  Map<String, Object?> toJson() => _$RecordPostRatingResponseDtoToJson(this);
}
