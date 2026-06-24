// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'relevance_feedback_signal_dto_action_action.dart';
import 'relevance_feedback_target_dto.dart';

part 'relevance_feedback_signal_dto.g.dart';

@JsonSerializable()
class RelevanceFeedbackSignalDto {
  const RelevanceFeedbackSignalDto({
    required this.action,
    required this.createdAt,
    required this.feedbackId,
    required this.target,
    required this.userId,
    this.rating,
  });

  factory RelevanceFeedbackSignalDto.fromJson(Map<String, Object?> json) =>
      _$RelevanceFeedbackSignalDtoFromJson(json);

  final RelevanceFeedbackSignalDtoActionAction action;
  final DateTime createdAt;
  final String feedbackId;
  final num? rating;
  final RelevanceFeedbackTargetDto target;
  final String userId;

  Map<String, Object?> toJson() => _$RelevanceFeedbackSignalDtoToJson(this);
}
