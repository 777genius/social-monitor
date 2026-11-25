// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'relevance_feedback_target_dto_feedback_reason_feedback_reason.dart';

part 'relevance_feedback_target_dto.g.dart';

@JsonSerializable()
class RelevanceFeedbackTargetDto {
  const RelevanceFeedbackTargetDto({
    required this.interestId,
    required this.providerKey,
    this.feedbackReason,
    this.feedItemId,
    this.sourceItemId,
  });

  factory RelevanceFeedbackTargetDto.fromJson(Map<String, Object?> json) =>
      _$RelevanceFeedbackTargetDtoFromJson(json);

  final RelevanceFeedbackTargetDtoFeedbackReasonFeedbackReason? feedbackReason;
  final String? feedItemId;
  final String interestId;
  final String providerKey;
  final String? sourceItemId;

  Map<String, Object?> toJson() => _$RelevanceFeedbackTargetDtoToJson(this);
}
