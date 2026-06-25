// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'relevance_feedback_target_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RelevanceFeedbackTargetDto _$RelevanceFeedbackTargetDtoFromJson(
  Map<String, dynamic> json,
) => RelevanceFeedbackTargetDto(
  providerKey: json['providerKey'] as String,
  topicId: json['topicId'] as String,
  feedbackReason: json['feedbackReason'] == null
      ? null
      : RelevanceFeedbackTargetDtoFeedbackReasonFeedbackReason.fromJson(
          json['feedbackReason'] as String,
        ),
  feedItemId: json['feedItemId'] as String?,
);

Map<String, dynamic> _$RelevanceFeedbackTargetDtoToJson(
  RelevanceFeedbackTargetDto instance,
) => <String, dynamic>{
  'feedbackReason': instance.feedbackReason,
  'feedItemId': instance.feedItemId,
  'providerKey': instance.providerKey,
  'topicId': instance.topicId,
};
