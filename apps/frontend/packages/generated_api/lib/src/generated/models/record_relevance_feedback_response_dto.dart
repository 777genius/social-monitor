// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'record_relevance_feedback_response_dto_learning_direction_learning_direction.dart';
import 'relevance_feedback_signal_dto.dart';
import 'user_relevance_profile_dto.dart';

part 'record_relevance_feedback_response_dto.g.dart';

@JsonSerializable()
class RecordRelevanceFeedbackResponseDto {
  const RecordRelevanceFeedbackResponseDto({
    required this.created,
    required this.feedback,
    required this.learningDirection,
    required this.profile,
  });

  factory RecordRelevanceFeedbackResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$RecordRelevanceFeedbackResponseDtoFromJson(json);

  final bool created;
  final RelevanceFeedbackSignalDto feedback;
  final RecordRelevanceFeedbackResponseDtoLearningDirectionLearningDirection
  learningDirection;
  final UserRelevanceProfileDto profile;

  Map<String, Object?> toJson() =>
      _$RecordRelevanceFeedbackResponseDtoToJson(this);
}
